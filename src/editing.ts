import { Modal, App, Editor, Notice } from 'obsidian'

interface DiffLine {
	type: 'context' | 'added' | 'removed'
	text: string
}

export interface EditPreviewOptions {
	title: string
	original: string
	revised: string
	onApply: () => void | Promise<void>
}

class EditPreviewModal extends Modal {
	private options: EditPreviewOptions
	private diff: DiffLine[]
	private resolve: (result: boolean) => void
	private applied = false

	constructor(app: App, options: EditPreviewOptions, resolve: (result: boolean) => void) {
		super(app)
		this.options = options
		this.resolve = resolve
		this.diff = computeLineDiff(options.original, options.revised)
	}

	onOpen() {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass('lonely-assistant-diff-modal')

		contentEl.createEl('h2', { text: this.options.title })

		const summary = contentEl.createDiv('lonely-assistant-diff-summary')
		const added = this.diff.filter((line) => line.type === 'added').length
		const removed = this.diff.filter((line) => line.type === 'removed').length
		summary.setText(`Added ${added} line${added === 1 ? '' : 's'}, removed ${removed} line${removed === 1 ? '' : 's'}.`)

		const diffEl = contentEl.createDiv('lonely-assistant-diff-view')
		for (const line of this.diff) {
			const row = diffEl.createDiv(`lonely-assistant-diff-line lonely-assistant-diff-${line.type}`)
			row.setText(prefixForDiff(line.type) + line.text)
		}

		const footer = contentEl.createDiv('lonely-assistant-diff-footer')
		const cancelButton = footer.createEl('button', {
			text: 'Cancel',
			cls: 'lonely-assistant-cancel-button',
		})
		cancelButton.addEventListener('click', () => {
			this.close()
		})

		const applyButton = footer.createEl('button', {
			text: 'Apply Changes',
			cls: 'lonely-assistant-send-button',
		})
		applyButton.addEventListener('click', async () => {
			try {
				await this.options.onApply()
				this.applied = true
				this.close()
				new Notice('Changes applied')
			} catch (error) {
				console.error('Failed to apply edit', error)
				new Notice('Failed to apply edit. Check console for details.')
			}
		})
	}

	onClose() {
		super.onClose()
		this.contentEl.empty()
		this.resolve(this.applied)
	}
}

export function openEditPreview(app: App, options: EditPreviewOptions): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new EditPreviewModal(app, options, resolve)
		modal.open()
	})
}

export async function previewAndApplySelection(app: App, editor: Editor, revised: string, title = 'Apply Lonely Assistant response'): Promise<boolean> {
	const selection = editor.getSelection()
	let original = selection
	let from = editor.getCursor('from')
	let to = editor.getCursor('to')
	let replaceEntireDocument = false

	if (!original) {
		replaceEntireDocument = true
		original = editor.getValue()
		from = { line: 0, ch: 0 }
		const lastLine = editor.lastLine()
		to = { line: lastLine, ch: editor.getLine(lastLine).length }
	}

	if (original === revised) {
		new Notice('Assistant response matches existing text; nothing to apply.')
		return false
	}

	const applied = await openEditPreview(app, {
		title,
		original,
		revised,
		onApply: async () => {
			if (replaceEntireDocument) {
				editor.setValue(revised)
			} else {
				editor.replaceRange(revised, from, to)
			}
		},
	})

	return applied
}

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
	const a = oldText.split('\n')
	const b = newText.split('\n')
	const m = a.length
	const n = b.length
	const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

	for (let i = m - 1; i >= 0; i--) {
		for (let j = n - 1; j >= 0; j--) {
			if (a[i] === b[j]) {
				dp[i][j] = dp[i + 1][j + 1] + 1
			} else {
				dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
			}
		}
	}

	const diff: DiffLine[] = []
	let i = 0
	let j = 0
	while (i < m && j < n) {
		if (a[i] === b[j]) {
			diff.push({ type: 'context', text: a[i] })
			i += 1
			j += 1
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			diff.push({ type: 'removed', text: a[i] })
			i += 1
		} else {
			diff.push({ type: 'added', text: b[j] })
			j += 1
		}
	}

	while (i < m) {
		diff.push({ type: 'removed', text: a[i] })
		i += 1
	}
	while (j < n) {
		diff.push({ type: 'added', text: b[j] })
		j += 1
	}

	return collapseContext(diff)
}

function collapseContext(diff: DiffLine[]): DiffLine[] {
	const result: DiffLine[] = []
	let buffer: DiffLine[] = []
	for (const line of diff) {
		if (line.type === 'context') {
			buffer.push(line)
		} else {
			if (buffer.length > 4) {
				const head = buffer.slice(0, 2)
				const tail = buffer.slice(-2)
				result.push(...head)
				if (buffer.length > 4) {
					result.push({ type: 'context', text: '…' })
				}
				result.push(...tail)
			} else {
				result.push(...buffer)
			}
			buffer = []
			result.push(line)
		}
	}
	if (buffer.length) {
		result.push(...buffer)
	}
	return result
}

function prefixForDiff(type: DiffLine['type']): string {
	switch (type) {
		case 'added':
			return '+ '
		case 'removed':
			return '- '
		default:
			return '  '
	}
}
