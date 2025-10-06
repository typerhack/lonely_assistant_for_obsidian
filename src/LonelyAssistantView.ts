import { ItemView, WorkspaceLeaf, Notice } from 'obsidian'
import { OllamaClient, OllamaMessage } from './OllamaClient'
import { LonelyAssistantSettings } from './settings'

interface LonelyAssistantPluginApi {
	settings: LonelyAssistantSettings
	ollamaClient: OllamaClient
}

export const VIEW_TYPE_LONELY_ASSISTANT = 'lonely-assistant-view'

export class LonelyAssistantView extends ItemView {
	plugin: LonelyAssistantPluginApi
	contentEl: HTMLElement
	outputEl: HTMLElement
	messageListEl: HTMLElement
	statusEl: HTMLElement
	inputEl: HTMLTextAreaElement
	sendButton: HTMLButtonElement
	cancelButton: HTMLButtonElement
	isStreaming = false
	abortController: AbortController | null = null
	messages: OllamaMessage[] = []
	inputWrapperEl: HTMLElement
	messageElements: WeakMap<OllamaMessage, HTMLElement> = new WeakMap()

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

		this.outputEl = this.contentEl.createDiv('lonely-assistant-output')
		this.messageListEl = this.outputEl.createDiv('lonely-assistant-messages')

		this.inputWrapperEl = this.contentEl.createDiv('lonely-assistant-input-container')

		this.inputEl = this.inputWrapperEl.createEl('textarea', {
			placeholder: 'Ask the model…',
			cls: 'lonely-assistant-input'
		})

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
	}

	registerEvents() {
		this.sendButton.addEventListener('click', () => this.sendMessage())
		this.cancelButton.addEventListener('click', () => this.cancelStream())
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault()
				this.sendMessage()
			}
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
	}

	private async streamCompletion(userContent: string) {
		if (this.isStreaming) return

		this.abortController = new AbortController()
		this.startStreaming()

		let assistantMessage: OllamaMessage | null = null

		try {
			this.trimHistory()
			this.appendMessage({ role: 'user', content: userContent })
			const conversation: OllamaMessage[] = [...this.messages]
			assistantMessage = this.appendMessage({ role: 'assistant', content: '' })

			const messages: OllamaMessage[] = [
				{ role: 'system', content: this.plugin.settings.defaultPrompt },
				...conversation,
			]

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

	private setBubbleContent(message: OllamaMessage, content: string, options: { streaming?: boolean } = {}) {
		const bubble = this.messageElements.get(message)
		if (!bubble) {
			return
		}

		bubble.empty()
		const isStreaming = options.streaming ?? content.length === 0

		if (!isStreaming) {
			bubble.setText(content)
			bubble.removeClass('lonely-assistant-bubble-streaming')
			return
		}

		bubble.addClass('lonely-assistant-bubble-streaming')
		const typing = bubble.createSpan({ cls: 'lonely-assistant-typing' })
		for (let i = 0; i < 3; i++) {
			typing.createSpan({ cls: 'lonely-assistant-typing-dot', text: '•' })
		}
	}
}
