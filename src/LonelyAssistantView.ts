import { ItemView, WorkspaceLeaf, Notice, TFile, MarkdownRenderer } from 'obsidian'
import { OllamaClient, OllamaMessage } from './OllamaClient'
import { LonelyAssistantSettings } from './settings'
import type { RAGContext, RetrievedChunk } from './rag'

interface LonelyAssistantPluginApi {
	settings: LonelyAssistantSettings
	ollamaClient: OllamaClient
	ragService: {
		getContextForMessage: (query: string) => Promise<RAGContext | null>
		getChunksForFiles: (filePaths: string[]) => Promise<RetrievedChunk[]>
		buildPrompt: (active: RetrievedChunk[], retrieved: RetrievedChunk[], mentions?: RetrievedChunk[]) => string
	}
}

export const VIEW_TYPE_LONELY_ASSISTANT = 'lonely-assistant-view'

export class LonelyAssistantView extends ItemView {
	plugin: LonelyAssistantPluginApi
	contentEl: HTMLElement
	outputEl: HTMLElement
	messageListEl: HTMLElement
	statusEl: HTMLElement
	contextContainer: HTMLElement
	contextListEl: HTMLElement
	contextToggleEl: HTMLInputElement
	contextCollapseButton: HTMLElement
	contextCollapsed = true
	inputEl: HTMLTextAreaElement
	sendButton: HTMLButtonElement
	cancelButton: HTMLButtonElement
	isStreaming = false
	abortController: AbortController | null = null
	messages: OllamaMessage[] = []
	inputWrapperEl: HTMLElement
	messageElements: WeakMap<OllamaMessage, HTMLElement> = new WeakMap()
	includeContext = true
	pendingContext: RAGContext | null = null
	lastContext: RAGContext | null = null
	lastAssistantText: string | null = null
	mentionSuggestionsEl: HTMLElement
	mentionSuggestions: TFile[] = []
	mentionSelectedIndex = 0
	mentionRange: { start: number; end: number } | null = null

	constructor(leaf: WorkspaceLeaf, plugin: LonelyAssistantPluginApi) {
		super(leaf)
		this.plugin = plugin
	}

	getViewType(): string {
		return VIEW_TYPE_LONELY_ASSISTANT
	}

	getDisplayText(): string {
		return 'Lonely Assistant'
	}

	getIcon(): string {
		return 'message-square'
	}

	async onOpen() {
		this.contentEl = this.containerEl.children[1] as HTMLElement
		this.contentEl.empty()
		this.contentEl.addClass('lonely-assistant-view')

		this.createUI()
	}

	createUI() {
		const header = this.contentEl.createEl('div', { cls: 'lonely-assistant-header' })
		header.createSpan({ text: 'Lonely Assistant' })
		this.statusEl = header.createSpan({ cls: 'lonely-assistant-status', text: '' })
		
		const newChatButton = header.createEl('button', {
			cls: 'lonely-assistant-new-chat-button',
			attr: { 'aria-label': 'New Chat' }
		})
		newChatButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
		newChatButton.addEventListener('click', () => this.clearChat())

		this.contextContainer = this.contentEl.createDiv('lonely-assistant-context')
		const contextHeader = this.contextContainer.createDiv('lonely-assistant-context-header')
		const contextHeaderLeft = contextHeader.createDiv('lonely-assistant-context-header-left')
		contextHeaderLeft.createSpan({ text: 'Context Preview' })
		
		this.contextCollapseButton = contextHeader.createEl('button', {
			cls: 'lonely-assistant-context-collapse-button',
			attr: { 'aria-label': 'Toggle Context Preview' }
		})
		this.contextCollapseButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`
		this.contextCollapseButton.addEventListener('click', () => {
			this.contextCollapsed = !this.contextCollapsed
			this.updateContextCollapse()
		})
		
		const contextControls = this.contextContainer.createDiv('lonely-assistant-context-controls')
		const toggleLabel = contextControls.createEl('label', { cls: 'lonely-assistant-context-toggle' })
		this.contextToggleEl = toggleLabel.createEl('input', { type: 'checkbox' })
		if (!this.plugin.settings.ragEnabled) {
			this.includeContext = false
		}
		this.contextToggleEl.checked = this.includeContext
		toggleLabel.createSpan({ text: 'Include on send' })
		this.contextToggleEl.addEventListener('change', () => {
			this.includeContext = this.contextToggleEl.checked
			if (!this.includeContext) {
				this.renderContextPreview(null, 'disabled')
			} else {
				this.renderContextPreview(this.lastContext, this.lastContext ? 'ready' : 'idle')
			}
		})
		
		this.contextListEl = this.contextContainer.createDiv('lonely-assistant-context-list')
		if (this.includeContext) {
			this.renderContextPreview(null, 'idle')
		} else {
			this.renderContextPreview(null, 'disabled')
		}
		
		this.updateContextCollapse()

		this.outputEl = this.contentEl.createDiv('lonely-assistant-output')
		this.messageListEl = this.outputEl.createDiv('lonely-assistant-messages')

		this.inputWrapperEl = this.contentEl.createDiv('lonely-assistant-input-container')

		const inputGroup = this.inputWrapperEl.createDiv('lonely-assistant-input-group')
		
		this.inputEl = inputGroup.createEl('textarea', {
			placeholder: 'Ask the model…',
			cls: 'lonely-assistant-input',
			attr: { spellcheck: 'false' }
		})

		this.mentionSuggestionsEl = this.inputWrapperEl.createDiv('lonely-assistant-mention-suggestions')

		const buttonContainer = this.inputWrapperEl.createDiv('lonely-assistant-buttons')

		this.sendButton = buttonContainer.createEl('button', {
			text: 'Send',
			cls: 'lonely-assistant-send-button'
		})

		this.cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'lonely-assistant-cancel-button'
		})
		this.cancelButton.style.display = 'none'

		this.renderEmptyState()
		this.registerEvents()
		this.hideMentionSuggestions()
	}

	registerEvents() {
		this.sendButton.addEventListener('click', () => this.sendMessage())
		this.cancelButton.addEventListener('click', () => this.cancelStream())
		this.inputEl.addEventListener('keydown', (event) => {
			if (this.handleMentionNavigation(event)) {
				return
			}
			if (event.key === 'Backspace') {
				if (this.handleMentionBackspace()) {
					event.preventDefault()
					return
				}
			}
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault()
				this.sendMessage()
			}
		})
		this.inputEl.addEventListener('input', () => {
			this.updateMentionSuggestions()
		})
		this.inputEl.addEventListener('blur', () => {
			window.setTimeout(() => this.hideMentionSuggestions(), 100)
		})
	}

	renderEmptyState() {
		this.messageListEl.empty()
		this.messageListEl.createDiv({
			cls: 'lonely-assistant-empty',
			text: 'Start a conversation to see responses here.',
		})
	}

	async sendMessage() {
		const message = this.inputEl.value.trim()
		if (!message || this.isStreaming) return

		this.inputEl.value = ''
		this.hideMentionSuggestions()
		await this.streamCompletion(message)
	}

	async askModel(content: string) {
		if (this.isStreaming) return

		await this.streamCompletion(`Please analyze this content:\n\n${content}`)
	}

	startStreaming() {
		this.isStreaming = true
		this.sendButton.disabled = true
		this.cancelButton.style.display = 'inline-block'
		this.setStatus('Thinking…')
	}

	stopStreaming() {
		this.isStreaming = false
		this.sendButton.disabled = false
		this.cancelButton.style.display = 'none'
		this.abortController = null
		this.setStatus('')
	}

	cancelStream() {
		if (!this.abortController) {
			return
		}
		this.abortController.abort()
		this.setStatus('Cancelling…')
		const lastMessage = this.messages[this.messages.length - 1]
		if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.content) {
			lastMessage.content = 'Request cancelled'
			this.updateMessage(lastMessage)
		}
		this.pendingContext = null
		this.lastContext = null
		this.lastAssistantText = null
	}

	clearChat() {
		if (this.isStreaming) {
			this.cancelStream()
		}
		this.messages = []
		this.messageListEl.empty()
		this.lastContext = null
		this.lastAssistantText = null
		this.pendingContext = null
		this.renderEmptyState()
		if (this.includeContext) {
			this.renderContextPreview(null, 'idle')
		} else {
			this.renderContextPreview(null, 'disabled')
		}
	}

	private async streamCompletion(userContent: string) {
		if (this.isStreaming) return

		this.abortController = new AbortController()
		this.startStreaming()

		let assistantMessage: OllamaMessage | null = null

		try {
			const mentionNames = this.extractMentions(userContent)
			let mentionChunks: RetrievedChunk[] = []
			if (mentionNames.length) {
				const { paths, missing } = await this.resolveMentions(mentionNames)
				if (missing.length) {
					new Notice(`Notes not found: ${missing.join(', ')}`)
				}
				if (paths.length) {
					mentionChunks = await this.plugin.ragService.getChunksForFiles(paths)
				}
			}

			let context: RAGContext | null = null
			if (this.includeContext && (this.plugin.settings.ragEnabled || mentionChunks.length)) {
				this.renderContextPreview(null, 'pending')
				context = await this.plugin.ragService.getContextForMessage(userContent)
				if (context) {
					context.mentions = mentionChunks
					context.prompt = this.plugin.ragService.buildPrompt(context.active, context.retrieved, mentionChunks)
				} else if (mentionChunks.length) {
					context = {
						active: [],
						retrieved: [],
						mentions: mentionChunks,
						prompt: this.plugin.ragService.buildPrompt([], [], mentionChunks),
					}
				}
			} else if (!this.includeContext) {
				this.renderContextPreview(null, 'disabled')
			}

			if (context && this.includeContext) {
				this.renderContextPreview(context, 'pending')
			} else if (this.includeContext) {
				if (mentionChunks.length) {
					this.renderContextPreview({ active: [], retrieved: [], mentions: mentionChunks, prompt: '' }, 'empty')
				} else {
					this.renderContextPreview(null, 'empty')
				}
			}

			this.pendingContext = this.includeContext ? context : null
			if (!this.includeContext) {
				this.pendingContext = null
			}

			this.trimHistory()
			this.appendMessage({ role: 'user', content: userContent })
			const conversation: OllamaMessage[] = [...this.messages]
			assistantMessage = this.appendMessage({ role: 'assistant', content: '' })

			const messages: OllamaMessage[] = [{
				role: 'system',
				content: this.plugin.settings.defaultPrompt,
			}]
			if (context && context.prompt) {
				messages.push({ role: 'system', content: context.prompt })
			}
			messages.push(...conversation)

			let responseText = ''
			for await (const chunk of this.plugin.ollamaClient.chat(
				messages,
				this.plugin.settings.model,
				{
					temperature: this.plugin.settings.temperature,
					maxTokens: this.plugin.settings.maxTokens,
				},
				this.abortController.signal
			)) {
				responseText += chunk
				assistantMessage.content = responseText
				this.updateMessage(assistantMessage)
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return
			}

			const message = error instanceof Error ? error.message : String(error)
			if (assistantMessage) {
				assistantMessage.content = `Error: ${message}`
				this.updateMessage(assistantMessage)
			} else {
				this.appendMessage({ role: 'assistant', content: `Error: ${message}` })
			}
			new Notice(`Error: ${message}`)
		} finally {
			if (assistantMessage) {
				this.lastAssistantText = assistantMessage.content || null
			} else {
				this.lastAssistantText = null
			}
			if (assistantMessage && this.pendingContext && this.includeContext) {
				this.attachContextFootnote(assistantMessage, this.pendingContext)
				this.lastContext = this.pendingContext
			}
			this.pendingContext = null
			if (!this.includeContext) {
				this.renderContextPreview(null, 'disabled')
			} else if (this.lastContext) {
				this.renderContextPreview(this.lastContext, 'ready')
			} else {
				this.renderContextPreview(null, 'idle')
			}
			this.stopStreaming()
			this.scrollToBottom()
		}
	}

	private appendMessage(message: OllamaMessage): OllamaMessage {
		if (!this.messageListEl) {
			return message
		}

		if (this.messages.length === 0) {
			this.messageListEl.empty()
		}

		this.messages.push(message)
		this.renderMessageNode(message)
		this.setBubbleContent(message, message.content ?? '', { streaming: message.role === 'assistant' && !message.content })
		this.scrollToBottom()
		return message
	}

	private renderMessageNode(message: OllamaMessage) {
		const messageEl = this.messageListEl.createDiv({
			cls: `lonely-assistant-message lonely-assistant-message-${message.role}`,
		})

		const bubble = messageEl.createDiv({ cls: 'lonely-assistant-bubble' })
		messageEl.dataset.role = message.role
		this.messageElements.set(message, bubble)
	}

	private updateMessage(message: OllamaMessage) {
		this.setBubbleContent(message, message.content ?? '', { streaming: message.role === 'assistant' && !message.content })
	}

	private scrollToBottom() {
		this.outputEl.scrollTop = this.outputEl.scrollHeight
	}

	private trimHistory() {
		const maxMessages = 40
		const budget = maxMessages - 2
		if (budget <= 0) {
			this.messages = []
			this.messageListEl.empty()
			return
		}

		if (this.messages.length <= budget) {
			return
		}

		const removeCount = this.messages.length - budget
		const removed = this.messages.splice(0, removeCount)
		for (const message of removed) {
			this.messageElements.delete(message)
		}
		for (let i = 0; i < removeCount; i++) {
			const firstChild = this.messageListEl.firstElementChild
			if (firstChild) {
				firstChild.remove()
			}
		}
	}

	private setStatus(status: string) {
		if (!this.statusEl) {
			return
		}
		this.statusEl.setText(status)
	}

	private renderContextPreview(context: RAGContext | null, state: 'idle' | 'pending' | 'ready' | 'disabled' | 'empty') {
		if (!this.contextListEl) {
			return
		}
		this.contextListEl.empty()
		const messageEl = this.contextListEl.createDiv('lonely-assistant-context-status')
		switch (state) {
			case 'pending':
				messageEl.setText('Gathering context…')
				return
			case 'disabled':
				messageEl.setText('Context injection is disabled for the next message.')
				return
			case 'idle':
				messageEl.setText('Context will be collected when you send a message.')
				return
			case 'empty':
				messageEl.setText('No relevant context found for this prompt.')
				return
			case 'ready':
				if (!context) {
					messageEl.setText('No context attached to the last response.')
					return
				}
				messageEl.setText('Context used in the last response:')
				break
		}

		const list = this.contextListEl.createEl('div', { cls: 'lonely-assistant-context-sections' })
		const renderSection = (chunks: RetrievedChunk[], label: string) => {
			if (!chunks.length) {
				return
			}
			const section = list.createDiv('lonely-assistant-context-section')
			section.createSpan({ cls: 'lonely-assistant-context-section-title', text: label })
			const ul = section.createEl('ul', { cls: 'lonely-assistant-context-items' })
			chunks.forEach((entry) => {
				const li = ul.createEl('li', { cls: 'lonely-assistant-context-item' })
				
				const pathContainer = li.createDiv({ cls: 'lonely-assistant-context-item-path-container' })
				const pathText = entry.chunk.headings.length 
					? `${entry.chunk.file} › ${entry.chunk.headings.join(' › ')}` 
					: entry.chunk.file
				const pathEl = pathContainer.createSpan({ cls: 'lonely-assistant-context-item-path' })
				pathEl.setText(pathText)
				pathEl.setAttribute('title', pathText)
				
				const snippetContent = entry.chunk.content.trim().slice(0, 150)
				li.createEl('div', { cls: 'lonely-assistant-context-item-snippet', text: snippetContent + (entry.chunk.content.length > 150 ? '…' : '') })
			})
		}

			renderSection(context.active, 'Active note')
			renderSection(context.retrieved, 'Retrieved')
			renderSection(context.mentions || [], 'Mentions')
	}

	private attachContextFootnote(message: OllamaMessage, context: RAGContext | null) {
		const bubble = this.messageElements.get(message)
		if (!bubble) {
			return
		}
		let footnote = bubble.querySelector('.lonely-assistant-context-footnote') as HTMLElement | null
		if (!context || (!context.active.length && !context.retrieved.length)) {
			if (footnote) {
				footnote.remove()
			}
			return
		}
		if (!footnote) {
			footnote = bubble.createDiv('lonely-assistant-context-footnote')
		}
		footnote.empty()
		footnote.createSpan({ cls: 'lonely-assistant-context-footnote-title', text: 'Context sources:' })
		const list = footnote.createEl('ul', { cls: 'lonely-assistant-context-footnote-list' })
		const appendItems = (chunks: RetrievedChunk[]) => {
			chunks.forEach((entry) => {
				const item = list.createEl('li', { cls: 'lonely-assistant-context-footnote-item' })
				const location = entry.chunk.headings.length ? `${entry.chunk.file} › ${entry.chunk.headings.join(' › ')}` : entry.chunk.file
				item.setText(location)
			})
		}
		appendItems(context.active)
		appendItems(context.retrieved)
		appendItems(context.mentions || [])
	}

	private setBubbleContent(message: OllamaMessage, content: string, options: { streaming?: boolean } = {}) {
		const bubble = this.messageElements.get(message)
		if (!bubble) {
			return
		}

		bubble.empty()
		const isStreaming = options.streaming ?? content.length === 0

		if (!isStreaming) {
			if (message.role === 'assistant') {
				MarkdownRenderer.renderMarkdown(content, bubble, '', this)
			} else {
				this.renderUserMessage(bubble, content)
			}
			bubble.removeClass('lonely-assistant-bubble-streaming')
			return
		}

		bubble.addClass('lonely-assistant-bubble-streaming')
		const typing = bubble.createSpan({ cls: 'lonely-assistant-typing' })
		for (let i = 0; i < 3; i++) {
			typing.createSpan({ cls: 'lonely-assistant-typing-dot', text: '•' })
		}
	}

	private renderUserMessage(container: HTMLElement, content: string) {
		const mentionPattern = /@([^\n@]+?)(?=\s@|$)/g
		let lastIndex = 0
		let match: RegExpExecArray | null

		while ((match = mentionPattern.exec(content)) !== null) {
			if (match.index > lastIndex) {
				const textNode = container.createSpan({ cls: 'lonely-assistant-user-text' })
				textNode.setText(content.slice(lastIndex, match.index))
			}
			const mention = container.createSpan({ cls: 'lonely-assistant-mention' })
			mention.setText(`@${match[1].trim()}`)
			lastIndex = match.index + match[0].length
		}

		if (lastIndex < content.length) {
			const textNode = container.createSpan({ cls: 'lonely-assistant-user-text' })
			textNode.setText(content.slice(lastIndex))
		}
	}

	getLastAssistantResponse(): string | null {
		return this.lastAssistantText
	}

	private handleMentionBackspace(): boolean {
		const cursor = this.inputEl.selectionStart || 0
		const value = this.inputEl.value
		
		if (cursor === 0 || this.inputEl.selectionStart !== this.inputEl.selectionEnd) {
			return false
		}

		const beforeCursor = value.slice(0, cursor)
		const mentionMatch = beforeCursor.match(/@([^\n@]+?)$/)
		
		if (mentionMatch) {
			const mentionStart = cursor - mentionMatch[0].length
			this.inputEl.value = value.slice(0, mentionStart) + value.slice(cursor)
			this.inputEl.selectionStart = this.inputEl.selectionEnd = mentionStart
			return true
		}
		
		return false
	}

	private handleMentionNavigation(event: KeyboardEvent): boolean {
		if (!this.mentionSuggestions.length) {
			return false
		}
		switch (event.key) {
			case 'ArrowDown':
				this.mentionSelectedIndex = (this.mentionSelectedIndex + 1) % this.mentionSuggestions.length
				this.renderMentionSuggestions()
				return true
			case 'ArrowUp':
				this.mentionSelectedIndex = (this.mentionSelectedIndex - 1 + this.mentionSuggestions.length) % this.mentionSuggestions.length
				this.renderMentionSuggestions()
				return true
			case 'Enter':
			case 'Tab':
				this.insertMention(this.mentionSuggestions[this.mentionSelectedIndex])
				return true
			case 'Escape':
				this.hideMentionSuggestions()
				return true
			default:
				return false
		}
	}

	private updateMentionSuggestions() {
		const value = this.inputEl.value
		const cursor = this.inputEl.selectionStart || 0
		const beforeCursor = value.slice(0, cursor)
		const match = beforeCursor.match(/@([^\s\n@]*)$/)
		if (!match) {
			this.hideMentionSuggestions()
			return
		}
		const query = match[1]
		this.mentionRange = { start: cursor - query.length - 1, end: cursor }
		const files = this.app.vault.getMarkdownFiles()
		const scored = files
			.map((file) => ({ file, score: this.scoreMentionCandidate(file, query) }))
			.filter(({ score }) => score > -Infinity)
			.sort((a, b) => b.score - a.score)
		const suggestions = scored.slice(0, 6).map(({ file }) => file)
		if (!suggestions.length) {
			this.hideMentionSuggestions()
			return
		}
		this.mentionSuggestions = suggestions
		this.mentionSelectedIndex = 0
		this.renderMentionSuggestions()
	}

	private renderMentionSuggestions() {
		this.mentionSuggestionsEl.empty()
		if (!this.mentionSuggestions.length) {
			this.mentionSuggestionsEl.removeClass('is-visible')
			return
		}
		this.mentionSuggestionsEl.addClass('is-visible')
		const list = this.mentionSuggestionsEl.createEl('div', { cls: 'lonely-assistant-mention-list' })
		this.mentionSuggestions.forEach((file, index) => {
			const item = list.createEl('button', {
				cls: 'lonely-assistant-mention-item',
			})
			if (index === this.mentionSelectedIndex) {
				item.addClass('is-selected')
			}
			const iconContainer = item.createDiv({ cls: 'lonely-assistant-mention-file-icon' })
			iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
			
			const header = item.createDiv({ cls: 'lonely-assistant-mention-item-header' })
			header.createSpan({ cls: 'lonely-assistant-mention-name', text: file.basename })
			header.createSpan({ cls: 'lonely-assistant-mention-path', text: file.path })
			item.addEventListener('mousedown', (event) => {
				event.preventDefault()
				this.insertMention(file)
			})
		})
	}

	private hideMentionSuggestions() {
		this.mentionSuggestions = []
		this.mentionSelectedIndex = 0
		this.mentionRange = null
		if (this.mentionSuggestionsEl) {
			this.mentionSuggestionsEl.empty()
			this.mentionSuggestionsEl.removeClass('is-visible')
		}
	}

	private insertMention(file: TFile) {
		if (!this.mentionRange) {
			return
		}
		const value = this.inputEl.value
		const mentionText = `@${file.basename}`
		const before = value.slice(0, this.mentionRange.start)
		const after = value.slice(this.mentionRange.end)
		const insertion = `${mentionText} `
		const nextValue = before + insertion + after
		this.inputEl.value = nextValue
		const cursor = before.length + insertion.length
		this.inputEl.setSelectionRange(cursor, cursor)
		this.hideMentionSuggestions()
		this.updateMentionSuggestions()
	}

	private scoreMentionCandidate(file: TFile, query: string): number {
		const name = file.basename.toLowerCase()
		const needle = query.toLowerCase()
		if (!needle) {
			return 200 - Math.min(name.length, 40)
		}
		const index = name.indexOf(needle)
		if (index >= 0) {
			return 400 - index * 5 - Math.abs(name.length - needle.length)
		}
		const pathIndex = file.path.toLowerCase().indexOf(needle)
		if (pathIndex >= 0) {
			return 200 - pathIndex
		}
		return -Infinity
	}

	private extractMentions(text: string): string[] {
		const matches = text.match(/@([^\n@]+?)(?=\s@|$)/g)
		if (!matches) {
			return []
		}
		return Array.from(new Set(matches.map((token) => token.slice(1).trim())))
	}

	private async resolveMentions(names: string[]): Promise<{ paths: string[]; missing: string[] }> {
		const files = this.app.vault.getMarkdownFiles()
		const paths: string[] = []
		const missing: string[] = []
		const lowerFiles = files.map((file) => ({ file, name: file.basename.toLowerCase(), path: file.path.toLowerCase() }))
		for (const rawName of names) {
			const name = rawName.toLowerCase()
			let match = lowerFiles.find((entry) => entry.name === name)
			if (!match) {
				match = lowerFiles.find((entry) => entry.name.includes(name))
			}
			if (!match) {
				match = lowerFiles.find((entry) => entry.path.includes(name))
			}
			if (match) {
				paths.push(match.file.path)
			} else {
				missing.push(rawName)
			}
		}
		return { paths: Array.from(new Set(paths)), missing }
	}

	private updateContextCollapse() {
		if (this.contextCollapsed) {
			this.contextContainer.classList.add('is-collapsed')
			this.contextCollapseButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`
		} else {
			this.contextContainer.classList.remove('is-collapsed')
			this.contextCollapseButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`
		}
	}
}
