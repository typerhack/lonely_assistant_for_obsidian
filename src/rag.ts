import { App, MarkdownView, TFile, Vault } from 'obsidian'
import type LonelyAssistantPlugin from '../main'

export interface VaultChunk {
	id: string
	file: string
	headings: string[]
	content: string
	contentLower: string
	updated: number
	start: number
	end: number
}

export interface RetrievedChunk {
	chunk: VaultChunk
	score: number
	source: 'active' | 'retrieved' | 'mention'
}

export interface RAGContext {
	active: RetrievedChunk[]
	retrieved: RetrievedChunk[]
	mentions: RetrievedChunk[]
	prompt: string
}

interface StoredChunk {
	id: string
	file: string
	headings: string[]
	content: string
	updated: number
}

const INDEX_DIR = '.lonely-assistant/index'
const INDEX_FILE = `${INDEX_DIR}/index.json`
const SAVE_DEBOUNCE_MS = 2500

export class RAGService {
	private chunks: VaultChunk[] = []
	private chunksByFile: Map<string, VaultChunk[]> = new Map()
	private plugin: LonelyAssistantPlugin
	private vault: Vault
	private app: App
	private ready: Promise<void>
	private saveTimeout: number | null = null
	private lastIndexWrite = 0

	constructor(plugin: LonelyAssistantPlugin) {
		this.plugin = plugin
		this.app = plugin.app
		this.vault = plugin.app.vault
		this.ready = this.loadIndex()
		this.registerVaultEvents()
	}

	async initialize() {
		await this.ready
		if (this.plugin.settings.ragEnabled && this.chunks.length === 0) {
			await this.rebuildIndex()
		}
	}

	async setEnabled(enabled: boolean) {
		if (enabled) {
			await this.ready
			if (this.chunks.length === 0) {
				await this.rebuildIndex()
			}
		} else {
			this.cancelSave()
		}
	}

	async clearIndex() {
		this.chunks = []
		this.chunksByFile.clear()
		this.cancelSave()
		const adapter = this.vault.adapter
		if (await adapter.exists(INDEX_FILE)) {
			await adapter.remove(INDEX_FILE)
		}
	}

	async rebuildIndex() {
		if (!this.plugin.settings.ragEnabled) {
			return
		}
		const markdownFiles = this.vault.getMarkdownFiles()
		const excluded = new Set(this.plugin.settings.ragExcludeFolders.map((f) => f.trim()).filter(Boolean))
		const chunks: VaultChunk[] = []

		for (const file of markdownFiles) {
			if (this.isExcluded(file, excluded)) {
				continue
			}
			const content = await this.vault.cachedRead(file)
			chunks.push(...this.chunkFile(file, content))
		}

		this.setChunks(chunks)
		await this.flushIndex()
	}

	async getContextForMessage(query: string, options: { allowRetrieved?: boolean } = {}): Promise<RAGContext | null> {
		if (!this.plugin.settings.ragEnabled) {
			return null
		}
		await this.ready
		const tokens = this.tokenize(query)
		const active = await this.getActiveNoteChunks(tokens)
		const retrieved = options.allowRetrieved && active.length === 0
			? this.retrieveChunks(tokens, [])
			: options.allowRetrieved && active.length > 0
				? this.retrieveChunks(tokens, active.map(c => c.chunk.file))
				: []
		const prompt = this.buildPrompt(active, retrieved)
		if (!active.length && !retrieved.length) {
			return null
		}
		return { active, retrieved, mentions: [], prompt }
	}

	async handleFileChange(file: TFile) {
		if (!this.plugin.settings.ragEnabled) {
			return
		}
		if (file.extension !== 'md') {
			return
		}
		await this.ready
		const excluded = new Set(this.plugin.settings.ragExcludeFolders.map((f) => f.trim()).filter(Boolean))
		if (this.isExcluded(file, excluded)) {
			this.removeFileChunks(file.path)
			await this.scheduleSave()
			return
		}
		const content = await this.vault.cachedRead(file)
		const newChunks = this.chunkFile(file, content)
		this.replaceFileChunks(file.path, newChunks)
		await this.scheduleSave()
	}

	private registerVaultEvents() {
		this.plugin.registerEvent(this.vault.on('modify', async (file) => {
			if (file instanceof TFile) {
				await this.handleFileChange(file)
			}
		}))
		this.plugin.registerEvent(this.vault.on('delete', async (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				await this.ready
				this.removeFileChunks(file.path)
				await this.scheduleSave()
			}
		}))
		this.plugin.registerEvent(this.vault.on('rename', async (file, oldName) => {
			if (file instanceof TFile && file.extension === 'md') {
				await this.ready
				const existing = this.chunksByFile.get(oldName)
				if (existing) {
					this.replaceFileChunks(oldName, [])
				}
				await this.handleFileChange(file)
			}
		}))
	}

	private async loadIndex() {
		const adapter = this.vault.adapter
		if (!(await adapter.exists(INDEX_FILE))) {
			this.chunks = []
			this.chunksByFile.clear()
			return
		}
		try {
			const raw = await adapter.read(INDEX_FILE)
			const stored = JSON.parse(raw) as StoredChunk[]
			const chunks = stored.map((entry) => this.hydrateChunk(entry))
			this.setChunks(chunks)
		} catch (error) {
			console.error('Failed to load RAG index, rebuilding...', error)
			this.chunks = []
			this.chunksByFile.clear()
			if (this.plugin.settings.ragEnabled) {
				await this.rebuildIndex()
			}
		}
	}

	private hydrateChunk(entry: StoredChunk): VaultChunk {
		return {
			...entry,
			contentLower: entry.content.toLowerCase(),
			start: 0,
			end: 0,
		}
	}

	private setChunks(chunks: VaultChunk[]) {
		this.chunks = chunks
		this.chunksByFile = new Map()
		for (const chunk of chunks) {
			const list = this.chunksByFile.get(chunk.file) || []
			list.push(chunk)
			this.chunksByFile.set(chunk.file, list)
		}
	}

	private replaceFileChunks(filePath: string, newChunks: VaultChunk[]) {
		this.chunks = this.chunks.filter((chunk) => chunk.file !== filePath)
		this.chunks.push(...newChunks)
		this.chunksByFile.set(filePath, newChunks)
	}

	private removeFileChunks(filePath: string) {
		this.chunks = this.chunks.filter((chunk) => chunk.file !== filePath)
		this.chunksByFile.delete(filePath)
	}

	private async ensureFileChunks(filePath: string): Promise<VaultChunk[]> {
		const existing = this.chunksByFile.get(filePath)
		if (existing && existing.length) {
			return existing
		}
		const abstract = this.vault.getAbstractFileByPath(filePath)
		if (!(abstract instanceof TFile) || abstract.extension !== 'md') {
			return []
		}
		const content = await this.vault.cachedRead(abstract)
		const chunks = this.chunkFile(abstract, content)
		if (this.plugin.settings.ragEnabled) {
			this.replaceFileChunks(filePath, chunks)
			await this.scheduleSave()
		} else {
			this.chunksByFile.set(filePath, chunks)
		}
		return chunks
	}

	async getChunksForFiles(filePaths: string[]): Promise<RetrievedChunk[]> {
		const unique = Array.from(new Set(filePaths)).filter(Boolean)
		const results: RetrievedChunk[] = []
		let score = 1000
		for (const path of unique) {
			const chunks = await this.ensureFileChunks(path)
			if (!chunks.length) {
				continue
			}
			const best = chunks[0]
			results.push({ chunk: best, score, source: 'mention' })
			score -= 1
		}
		return results
	}

	private async scheduleSave() {
		if (this.saveTimeout) {
			window.clearTimeout(this.saveTimeout)
		}
		this.saveTimeout = window.setTimeout(() => {
			void this.flushIndex()
		}, SAVE_DEBOUNCE_MS)
	}

	private cancelSave() {
		if (this.saveTimeout) {
			window.clearTimeout(this.saveTimeout)
			this.saveTimeout = null
		}
	}

	private async flushIndex() {
		this.cancelSave()
		const adapter = this.vault.adapter
		const stored: StoredChunk[] = this.chunks.map(({ id, file, headings, content, updated }) => ({
			id,
			file,
			headings,
			content,
			updated,
		}))
		if (!(await adapter.exists(INDEX_DIR))) {
			await adapter.mkdir(INDEX_DIR)
		}
		await adapter.write(INDEX_FILE, JSON.stringify(stored, null, 2))
		this.lastIndexWrite = Date.now()
	}

	private chunkFile(file: TFile, content: string): VaultChunk[] {
		const lines = content.split('\n')
		const chunks: VaultChunk[] = []
		let current: string[] = []
		let headings: string[] = []
		let chunkIndex = 0
		let offset = 0
		let chunkStart = 0

		const pushChunk = () => {
			const text = current.join('\n').trim()
			if (!text) {
				current = []
				return
			}
			const id = `${file.path}::${chunkIndex}`
			chunks.push({
				id,
				file: file.path,
				headings: [...headings],
				content: text,
				contentLower: text.toLowerCase(),
				updated: file.stat.mtime,
				start: chunkStart,
				end: offset,
			})
			chunkIndex += 1
			current = []
			chunkStart = offset
		}

		for (const line of lines) {
			const lineLength = line.length + 1
			if (line.trim().startsWith('#')) {
				pushChunk()
				headings = this.updateHeadings(headings, line)
			} else {
				current.push(line)
				const joined = current.join('\n')
				if (joined.length > 800) {
					pushChunk()
				}
			}
			offset += lineLength
		}
		pushChunk()

		return chunks
	}

	private updateHeadings(existing: string[], rawLine: string): string[] {
		const match = rawLine.match(/^(#+)\s*(.*)$/)
		if (!match) {
			return existing
		}
		const level = match[1].length
		const title = match[2].trim()
		const next = existing.slice(0, level - 1)
		next.push(title)
		return next
	}

	private isExcluded(file: TFile, excluded: Set<string>): boolean {
		for (const folder of excluded) {
			if (folder && file.path.startsWith(folder)) {
				return true
			}
		}
		return false
	}

	private tokenize(text: string): string[] {
		return Array.from(text.toLowerCase().matchAll(/[a-z0-9]{3,}/g)).map((match) => match[0])
	}

	private async getActiveNoteChunks(tokens: string[]): Promise<RetrievedChunk[]> {
		// Use active file instead of active view so chat focus doesn't break detection
		const file = this.app.workspace.getActiveFile()
		if (!file || file.extension !== 'md') {
			return []
		}
		const content = await this.vault.cachedRead(file)
		const chunks = this.chunkFile(file, content)
		if (!chunks.length) {
			return []
		}
		// Try to honor cursor position if the markdown view for this file is active
		let cursorIndex = -1
		const activeMdView = this.app.workspace.getActiveViewOfType(MarkdownView)
		if (activeMdView && activeMdView.file && activeMdView.file.path === file.path) {
			const cursor = activeMdView.editor.getCursor()
			const cursorOffset = activeMdView.editor.posToOffset(cursor)
			cursorIndex = chunks.findIndex(c => cursorOffset >= c.start && cursorOffset <= c.end)
		}
		// Order chunks so the one under the cursor is first (if available), then the rest
		const ordered = cursorIndex >= 0
			? [chunks[cursorIndex], ...chunks.slice(0, cursorIndex), ...chunks.slice(cursorIndex + 1)]
			: [...chunks]
		const results: RetrievedChunk[] = []
		let score = 1000
		for (const chunk of ordered) {
			const clean = this.sanitizeForPrompt(chunk.content)
			if (!clean.trim()) continue
			results.push({ chunk, score, source: 'active' })
			score -= 1
		}
		return results
	}

	private retrieveChunks(tokens: string[], excludeFiles: string[]): RetrievedChunk[] {
		const max = Math.max(0, this.plugin.settings.ragMaxContext - excludeFiles.length)
		if (max === 0) {
			return []
		}
		const exclude = new Set(excludeFiles)
		const scored: RetrievedChunk[] = []
		for (const chunk of this.chunks) {
			if (exclude.has(chunk.file)) {
				continue
			}
			const score = this.scoreChunk(chunk, tokens)
			if (score <= 0) {
				continue
			}
			// Skip chunks that become empty after sanitization (e.g., images-only)
			const clean = this.sanitizeForPrompt(chunk.content)
			if (!clean.trim()) {
				continue
			}
			scored.push({ chunk, score, source: 'retrieved' })
		}
		scored.sort((a, b) => b.score - a.score)
		return scored.slice(0, max)
	}

	private scoreChunk(chunk: VaultChunk, tokens: string[]): number {
		if (!tokens.length) {
			return 0
		}
		let score = 0
		for (const token of tokens) {
			const occurrences = chunk.contentLower.split(token).length - 1
			if (occurrences > 0) {
				score += occurrences * 5
			}
			for (const heading of chunk.headings) {
				if (heading.toLowerCase().includes(token)) {
					score += 10
				}
			}
		}
		return score
	}

	buildPrompt(active: RetrievedChunk[], retrieved: RetrievedChunk[], mentions: RetrievedChunk[] = []): string {
		const sections: string[] = []
		const append = (entry: RetrievedChunk, index: number, sourceOverride?: 'active' | 'retrieved' | 'mention') => {
			const location = entry.chunk.headings.length ? `${entry.chunk.file} > ${entry.chunk.headings.join(' > ')}` : entry.chunk.file
			const clean = this.sanitizeForPrompt(entry.chunk.content).trim()
			if (!clean) return
			sections.push(`${index}. (${sourceOverride ?? entry.source}) ${location}\n${clean}`)
		}
		let counter = 1
		for (const entry of active) append(entry, counter++)
		for (const entry of retrieved) append(entry, counter++)
		for (const entry of mentions) append(entry, counter++, 'mention')
		if (!sections.length) return ''
		return `Context snippets:\n${sections.join('\n\n')}\n\nUse the context above when answering. Cite the snippet numbers when relevant.`
	}

	// Remove noisy markup from snippets (images, embeds, raw links) leaving useful text
	private sanitizeForPrompt(text: string): string {
		let out = text
		// Remove markdown image embeds ![alt](url) and wiki image embeds ![[...]]
		out = out.replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
		out = out.replace(/!\[\[[^\]]+\]\]/g, '')
		// Replace standard links [text](url) with just the text
		out = out.replace(/\[([^\]]+)\]\((?:[^\)]+)\)/g, '$1')
		// Strip HTML <img ...>
		out = out.replace(/<img[^>]*>/gi, '')
		// Collapse excessive whitespace
		out = out.replace(/[\t\f\r]+/g, ' ')
		out = out.replace(/\n{3,}/g, '\n\n')
		return out
	}
}
