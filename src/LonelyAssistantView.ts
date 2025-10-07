import { ItemView, WorkspaceLeaf, Notice, TFile, MarkdownRenderer, setIcon } from 'obsidian'
import { Logger } from './logger'
import { OllamaClient, OllamaMessage } from './OllamaClient'
import { LonelyAssistantSettings } from './settings'
import type { RAGContext, RetrievedChunk } from './rag'
import type { ToolRegistry } from './tools/ToolRegistry'
import { convertToolsToOllamaSchemas } from './tools/toolSchemaConverter'

interface LonelyAssistantPluginApi {
	settings: LonelyAssistantSettings
	ollamaClient: OllamaClient
	ragService: {
		getContextForMessage: (query: string, options?: { allowRetrieved?: boolean }) => Promise<RAGContext | null>
		getChunksForFiles: (filePaths: string[]) => Promise<RetrievedChunk[]>
		buildPrompt: (active: RetrievedChunk[], retrieved: RetrievedChunk[], mentions?: RetrievedChunk[]) => string
	}
	toolRegistry: ToolRegistry
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
	inputEl: HTMLDivElement
	sendButton: HTMLButtonElement
	cancelButton: HTMLButtonElement
	isStreaming = false
	abortController: AbortController | null = null
	messages: OllamaMessage[] = []
	inputWrapperEl: HTMLElement
	messageElements: WeakMap<OllamaMessage, HTMLElement> = new WeakMap()
	includeContext = true
	contextMode: 'active-only' | 'active+vault' = 'active-only'
	pendingContext: RAGContext | null = null
	lastContext: RAGContext | null = null
	lastAssistantText: string | null = null
	mentionSuggestionsEl: HTMLElement
	mentionSuggestions: TFile[] = []
	mentionSelectedIndex = 0
	mentionRange: { start: number; end: number } | null = null
	isUpdatingInput = false

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

		this.renderToolsSection()

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

		// Context mode selector
		const modeGroup = contextControls.createDiv({ cls: 'lonely-assistant-context-mode' })
		const modeLabel = modeGroup.createEl('label', { cls: 'lonely-assistant-context-mode-label' })
		modeLabel.setText('Source:')
		const modeSelect = modeGroup.createEl('select', { cls: 'lonely-assistant-context-mode-select' })
		modeSelect.append(
			new Option('Active only', 'active-only'),
			new Option('Active + vault', 'active+vault')
		)
		modeSelect.value = this.contextMode
		modeSelect.addEventListener('change', () => {
			this.contextMode = (modeSelect.value as 'active-only' | 'active+vault')
			// Reset preview state; next send will collect accordingly
			if (this.includeContext) {
				this.renderContextPreview(null, 'idle')
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
		
		this.inputEl = inputGroup.createDiv({
			cls: 'lonely-assistant-input',
			attr: { 
				contenteditable: 'true',
				'data-placeholder': 'Ask the model…',
				spellcheck: 'false'
			}
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
			if (this.isUpdatingInput) return
			this.renderInputContent()
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
		const message = this.getInputText().trim()
		if (!message || this.isStreaming) return

		this.setInputText('')
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
		let chunksReceived = 0
		let idleTimer: number | null = null
		const resetIdle = () => {
			if (idleTimer) window.clearTimeout(idleTimer)
			idleTimer = window.setTimeout(() => {
				try { this.abortController?.abort() } catch {}
				Logger.warn('Streaming timeout: no data from Ollama within 25s')
				new Notice('No response from model (timeout). Try again or check Ollama.')
			}, 25000)
		}

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
				context = await this.plugin.ragService.getContextForMessage(userContent, { allowRetrieved: this.contextMode === 'active+vault' })
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
				Logger.info('Sending context', {
					active: context.active.length,
					retrieved: context.retrieved.length,
					mentions: context.mentions?.length || 0,
					promptChars: context.prompt.length,
				})
			}
			messages.push(...conversation)

			const tools = this.plugin.toolRegistry.getAvailableTools()
			const ollamaTools = tools.length > 0 ? convertToolsToOllamaSchemas(tools) : undefined

			let responseText = ''
			let finalMessage: OllamaMessage | null = null

			resetIdle()
			for await (const chunk of this.plugin.ollamaClient.chatWithTools(
				messages,
				this.plugin.settings.model,
				{
					temperature: this.plugin.settings.temperature,
					maxTokens: this.plugin.settings.maxTokens,
					tools: ollamaTools,
				},
				this.abortController.signal
			)) {
				resetIdle()
				if (chunk.type === 'content' && chunk.content) {
					if (chunksReceived === 0) Logger.info('First content chunk received')
					responseText += chunk.content
					assistantMessage.content = responseText
					this.updateMessage(assistantMessage)
					chunksReceived += 1
				} else if (chunk.type === 'message' && chunk.message) {
					finalMessage = chunk.message
				}
			}

			if (finalMessage?.tool_calls && finalMessage.tool_calls.length > 0) {
				Logger.info('Tool calls from model', finalMessage.tool_calls)
				this.setStatus('Executing tools...')
				assistantMessage.tool_calls = finalMessage.tool_calls

				for (const toolCall of finalMessage.tool_calls) {
					const toolName = toolCall.function.name
					const toolParams = this.normalizeToolArguments(toolCall.function.arguments)

					try {
						this.setStatus(`Executing ${toolName}...`)
						const result = await this.plugin.toolRegistry.executeWithConsent(toolName, toolParams)
						Logger.info('Tool executed', toolName, result.success)

						// If find tool succeeded, augment context with found files as mentions
						if (toolName === 'find' && result.success && Array.isArray((result as any).data)) {
							const paths: string[] = ((result as any).data as Array<{ path?: string }> )
								.map(item => String((item as any).path || ''))
								.filter(Boolean)
							const mentionChunks = await this.plugin.ragService.getChunksForFiles(paths)
							if (mentionChunks.length) {
								const base = this.pendingContext || { active: [], retrieved: [], mentions: [], prompt: '' }
								const updatedMentions = [...(base.mentions || []), ...mentionChunks]
								const updatedPrompt = this.plugin.ragService.buildPrompt(base.active, base.retrieved, updatedMentions)
								this.pendingContext = { ...base, mentions: updatedMentions, prompt: updatedPrompt }
								this.renderContextPreview(this.pendingContext, 'pending')
								messages.push({ role: 'system', content: updatedPrompt })
								Logger.info('Re-prompting after tool', { mentions: updatedMentions.length })
							}

							// Chain a grep over the found files to attach content snippets
							const pattern = (toolParams && (toolParams as any).pattern) ? String((toolParams as any).pattern) : ''
							if (pattern) {
								try {
									const grepResult = await this.plugin.toolRegistry.executeWithConsent('grep', {
										pattern,
										fileList: paths,
										contextLines: 2,
										maxMatches: 50,
									})
									if (grepResult.success && Array.isArray((grepResult as any).data)) {
										const matches = (grepResult as any).data as Array<{ file: string; context: string }>
										const toChunks = matches.slice(0, 12).map((m, i) => ({
											chunk: {
												id: `${m.file}::grep::${i}`,
												file: m.file,
												headings: [],
												content: m.context,
												contentLower: m.context.toLowerCase(),
												updated: Date.now(),
												start: 0,
												end: m.context.length,
											},
											score: 1,
											source: 'mention' as const,
										}))
										if (toChunks.length) {
											const base2 = this.pendingContext || { active: [], retrieved: [], mentions: [], prompt: '' }
											const mergedMentions = [...(base2.mentions || []), ...toChunks]
											const newPrompt = this.plugin.ragService.buildPrompt(base2.active, base2.retrieved, mergedMentions)
											this.pendingContext = { ...base2, mentions: mergedMentions, prompt: newPrompt }
											this.renderContextPreview(this.pendingContext, 'pending')
											messages.push({ role: 'system', content: newPrompt })
											Logger.info('Attached grep snippets', { count: toChunks.length })
										}
									}
								} catch (e) {
									Logger.warn('Grep chain failed', e)
								}
							}
						}

						messages.push({
							role: 'assistant',
							content: responseText || '',
							tool_calls: finalMessage.tool_calls,
						})

						messages.push({
							role: 'tool',
							content: JSON.stringify(result),
						})

						responseText = ''
						assistantMessage.content = ''
						this.updateMessage(assistantMessage)

						resetIdle()
						for await (const chunk of this.plugin.ollamaClient.chatWithTools(
							messages,
							this.plugin.settings.model,
							{
								temperature: this.plugin.settings.temperature,
								maxTokens: this.plugin.settings.maxTokens,
								tools: ollamaTools,
							},
							this.abortController.signal
						)) {
							resetIdle()
							if (chunk.type === 'content' && chunk.content) {
								responseText += chunk.content
								assistantMessage.content = responseText
								this.updateMessage(assistantMessage)
								chunksReceived += 1
							} else if (chunk.type === 'message' && chunk.message) {
								finalMessage = chunk.message
								Logger.info('Final message received after tool')
							}
						}

						if (finalMessage?.tool_calls && finalMessage.tool_calls.length > 0) {
							break
						}
					} catch (toolError) {
						const errorMessage = toolError instanceof Error ? toolError.message : String(toolError)
						new Notice(`Tool execution failed: ${errorMessage}`)
						Logger.error('Tool execution failed', toolName, errorMessage)
						
						assistantMessage.content = responseText + `\n\n[Tool execution failed: ${errorMessage}]`
						this.updateMessage(assistantMessage)
						break
					}
				}

				this.setStatus('')
			}

			// Re-ask fallback: if no tokens received or empty content after tool flow, try once without tools
			if ((!responseText || !responseText.trim()) && (this.pendingContext || (finalMessage?.tool_calls?.length ?? 0) > 0)) {
				Logger.warn('Empty/partial response after tools. Re-asking without tools...')
				this.setStatus('Re-asking without tools...')
				responseText = ''
				assistantMessage.content = ''
				this.updateMessage(assistantMessage)
				chunksReceived = 0
				resetIdle()
				const retryMessages: OllamaMessage[] = [
					{ role: 'system', content: this.plugin.settings.defaultPrompt },
				]
				if (this.pendingContext?.prompt) {
					retryMessages.push({ role: 'system', content: this.pendingContext.prompt })
				}
				retryMessages.push(
					{ role: 'system', content: 'You already have sufficient context above. Do not request or use any tools. Produce the final concise answer now.' },
					{ role: 'user', content: userContent }
				)

				for await (const chunk of this.plugin.ollamaClient.chatWithTools(
					retryMessages,
					this.plugin.settings.model,
					{ temperature: this.plugin.settings.temperature, maxTokens: this.plugin.settings.maxTokens, tools: undefined },
					this.abortController.signal
				)) {
					resetIdle()
					if (chunk.type === 'content' && chunk.content) {
						if (chunksReceived === 0) Logger.info('First content chunk received (fallback)')
						responseText += chunk.content
						assistantMessage.content = responseText
						this.updateMessage(assistantMessage)
						chunksReceived += 1
					}
				}
				// If still nothing, try non-streaming final ask
				if (!responseText || !responseText.trim()) {
					Logger.warn('Fallback streaming yielded no content; trying non-stream request...')
					try {
						const msg = await this.plugin.ollamaClient.chatOnce(
							retryMessages,
							this.plugin.settings.model,
							{ temperature: this.plugin.settings.temperature, maxTokens: this.plugin.settings.maxTokens },
							this.abortController.signal
						)
						if (msg?.content) {
							assistantMessage.content = msg.content
							this.updateMessage(assistantMessage)
							Logger.info('Non-stream fallback returned content')
						}
					} catch (e) {
						Logger.error('Non-stream fallback failed', e)
					}
				}
				this.setStatus('')
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
			if (idleTimer) window.clearTimeout(idleTimer)
			if (assistantMessage) {
				if (!assistantMessage.content || assistantMessage.content.trim().length === 0) {
					assistantMessage.content = chunksReceived > 0
						? '(response ended unexpectedly)'
						: 'No response received from model.'
					this.updateMessage(assistantMessage)
				}
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
			const header = section.createDiv({ cls: 'lonely-assistant-context-section-header' })
			const toggle = header.createDiv({ cls: 'lonely-assistant-context-section-toggle' })
			setIcon(toggle, 'chevron-down')
			header.createSpan({ cls: 'lonely-assistant-context-section-title', text: label })
			const ul = section.createEl('ul', { cls: 'lonely-assistant-context-items' })
			header.addEventListener('click', () => {
				section.classList.toggle('is-collapsed')
				setIcon(toggle, section.classList.contains('is-collapsed') ? 'chevron-right' : 'chevron-down')
			})
			chunks.forEach((entry) => {
				const li = ul.createEl('li', { cls: 'lonely-assistant-context-item' })
				
				const pathContainer = li.createDiv({ cls: 'lonely-assistant-context-item-path-container' })
				const pathText = entry.chunk.headings.length 
					? `${entry.chunk.file} › ${entry.chunk.headings.join(' › ')}` 
					: entry.chunk.file
				const pathEl = pathContainer.createSpan({ cls: 'lonely-assistant-context-item-path' })
				pathEl.setText(pathText)
				pathEl.setAttribute('title', pathText)
				
				const clean = this.sanitizeSnippet(entry.chunk.content)
				const snippetContent = clean.trim().slice(0, 150)
				li.createEl('div', { cls: 'lonely-assistant-context-item-snippet', text: snippetContent + (clean.length > 150 ? '…' : '') })
			})
		}

			renderSection(context.active, 'Active note')
			renderSection(context.retrieved, 'Retrieved')
			renderSection(context.mentions || [], 'Mentions')
	}

	private sanitizeSnippet(text: string): string {
		let out = text
		// Remove markdown image embeds and wiki embeds
		out = out.replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
		out = out.replace(/!\[\[[^\]]+\]\]/g, '')
		// Replace standard links [text](url) with just the text
		out = out.replace(/\[([^\]]+)\]\((?:[^\)]+)\)/g, '$1')
		// Remove HTML img tags
		out = out.replace(/<img[^>]*>/gi, '')
		// Normalize whitespace
		out = out.replace(/[\t\f\r]+/g, ' ')
		out = out.replace(/\n{3,}/g, '\n\n')
		return out
	}

	private attachContextFootnote(message: OllamaMessage, context: RAGContext | null) {
		const bubble = this.messageElements.get(message)
		if (!bubble) {
			return
		}
		let footnote = bubble.querySelector('.lonely-assistant-context-footnote') as HTMLElement | null
		if (!context || (!context.active.length && !context.retrieved.length && !(context.mentions && context.mentions.length))) {
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

		if (message.tool_calls && message.tool_calls.length > 0) {
			const toolSection = bubble.createDiv({ cls: 'lonely-assistant-tool-calls' })
			toolSection.createSpan({ cls: 'lonely-assistant-tool-calls-label', text: 'Used tools:' })
			const toolList = toolSection.createDiv({ cls: 'lonely-assistant-tool-list' })
			
			for (const toolCall of message.tool_calls) {
				const toolItem = toolList.createDiv({ cls: 'lonely-assistant-tool-item' })
				
				const toolHeader = toolItem.createDiv({ cls: 'lonely-assistant-tool-header' })
				const toolIcon = toolHeader.createDiv({ cls: 'lonely-assistant-tool-icon' })
				setIcon(toolIcon, this.getToolIcon(toolCall.function.name))
				toolHeader.createSpan({ 
					cls: 'lonely-assistant-tool-name', 
					text: this.formatToolName(toolCall.function.name) 
				})
				
					const normalizedArgs = this.normalizeToolArguments(toolCall.function.arguments)
					if (normalizedArgs && Object.keys(normalizedArgs).length > 0) {
						this.renderToolParams(toolItem, normalizedArgs)
					}
			}
		}

		if (!isStreaming) {
			if (message.role === 'assistant') {
				if (content) {
					MarkdownRenderer.renderMarkdown(content, bubble, '', this)
				}
			} else if (message.role === 'tool') {
				const toolResult = bubble.createDiv({ cls: 'lonely-assistant-tool-result' })
				toolResult.createSpan({ cls: 'lonely-assistant-tool-result-label', text: 'Tool result:' })
				const resultContent = toolResult.createEl('pre', { cls: 'lonely-assistant-tool-result-content' })
				resultContent.createEl('code', { text: content })
			} else {
				this.renderUserMessage(bubble, content)
			}
			bubble.removeClass('lonely-assistant-bubble-streaming')
			return
		}

		bubble.addClass('lonely-assistant-bubble-streaming')
		const waiting = bubble.createDiv({ cls: 'lonely-assistant-waiting' })
		waiting.createSpan({ cls: 'lonely-assistant-waiting-text', text: 'Waiting for model' })
		const typing = waiting.createSpan({ cls: 'lonely-assistant-typing' })
		for (let i = 0; i < 3; i++) typing.createSpan({ cls: 'lonely-assistant-typing-dot', text: '•' })
	}

	private renderUserMessage(container: HTMLElement, content: string) {
		const mentionPattern = /@[^\n@]+?(?=\s\s|\s@|@|$)/g
		let lastIndex = 0
		let match: RegExpExecArray | null

		while ((match = mentionPattern.exec(content)) !== null) {
			if (match.index > lastIndex) {
				const textNode = container.createSpan({ cls: 'lonely-assistant-user-text' })
				textNode.setText(content.slice(lastIndex, match.index))
			}
			const mention = container.createSpan({ cls: 'lonely-assistant-mention' })
			mention.setText(match[0].trim())
			lastIndex = match.index + match[0].length
		}

		if (lastIndex < content.length) {
			const textNode = container.createSpan({ cls: 'lonely-assistant-user-text' })
			textNode.setText(content.slice(lastIndex))
		}
	}

	private normalizeToolArguments(args: unknown): Record<string, unknown> {
		if (!args) return {}
		if (typeof args === 'string') {
			try {
				const parsed = JSON.parse(args)
				return typeof parsed === 'object' && parsed ? parsed as Record<string, unknown> : {}
			} catch {
				return {}
			}
		}
		if (typeof args === 'object') return args as Record<string, unknown>
		return {}
	}

	getLastAssistantResponse(): string | null {
		return this.lastAssistantText
	}

	private handleMentionBackspace(): boolean {
		const cursor = this.getCaretPosition()
		const text = this.getInputText()
		
		if (cursor === 0) {
			return false
		}

		const charBeforeCursor = text[cursor - 1]
		if (charBeforeCursor !== ' ') {
			return false
		}

		const beforeCursor = text.slice(0, cursor)
		const mentionWithSpaces = beforeCursor.match(/(@[^\n@]+?\s\s)$/)
		
		if (mentionWithSpaces) {
			const mentionStart = cursor - mentionWithSpaces[0].length
			const newText = text.slice(0, mentionStart) + text.slice(cursor)
			this.setInputText(newText)
			this.setCaretPosition(mentionStart)
			this.renderInputContent()
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
		const text = this.getInputText()
		const cursor = this.getCaretPosition()
		const beforeCursor = text.slice(0, cursor)
		const match = beforeCursor.match(/@([^\n@]*)$/)
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
		const text = this.getInputText()
		const mentionText = `@${file.basename}`
		const before = text.slice(0, this.mentionRange.start)
		const after = text.slice(this.mentionRange.end)
		const insertion = `${mentionText}  `
		const nextValue = before + insertion + after
		this.setInputText(nextValue)
		const cursor = before.length + insertion.length
		this.setCaretPosition(cursor)
		this.renderInputContent()
		this.hideMentionSuggestions()
		this.updateMentionSuggestions()
		this.inputEl.focus()
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
		const matches = text.match(/@[^\n@]+?(?=\s\s|\s@|@|$)/g)
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

	private getInputText(): string {
		return this.inputEl.textContent || ''
	}

	private setInputText(text: string) {
		this.inputEl.textContent = text
	}

	private getCaretPosition(): number {
		const selection = window.getSelection()
		if (!selection || selection.rangeCount === 0) return 0
		const range = selection.getRangeAt(0)
		const preCaretRange = range.cloneRange()
		preCaretRange.selectNodeContents(this.inputEl)
		preCaretRange.setEnd(range.endContainer, range.endOffset)
		return preCaretRange.toString().length
	}

	private setCaretPosition(position: number) {
		const selection = window.getSelection()
		if (!selection) return
		
		let currentPos = 0
		const walk = document.createTreeWalker(this.inputEl, NodeFilter.SHOW_TEXT, null)
		let node: Node | null
		
		while ((node = walk.nextNode())) {
			const textNode = node as Text
			const length = textNode.length
			if (currentPos + length >= position) {
				const range = document.createRange()
				range.setStart(textNode, position - currentPos)
				range.collapse(true)
				selection.removeAllRanges()
				selection.addRange(range)
				return
			}
			currentPos += length
		}
		
		const range = document.createRange()
		range.selectNodeContents(this.inputEl)
		range.collapse(false)
		selection.removeAllRanges()
		selection.addRange(range)
		this.inputEl.focus()
	}

	private renderInputContent() {
		if (this.isUpdatingInput) return
		
		const text = this.getInputText()
		
		const mentionPattern = /@[^\n@]+?(?=\s\s|\s@|@|$)/g
		const matches = Array.from(text.matchAll(mentionPattern))
		
		if (matches.length === 0) {
			return
		}
		
		const caretPos = this.getCaretPosition()
		
		this.isUpdatingInput = true
		this.inputEl.empty()
		
		let lastIndex = 0
		
		for (const match of matches) {
			if (match.index === undefined) continue
			
			if (match.index > lastIndex) {
				this.inputEl.appendText(text.slice(lastIndex, match.index))
			}
			
			const mentionSpan = this.inputEl.createSpan({ cls: 'lonely-assistant-input-mention' })
			mentionSpan.textContent = match[0]
			mentionSpan.contentEditable = 'false'
			
			lastIndex = match.index + match[0].length
		}
		
		if (lastIndex < text.length) {
			this.inputEl.appendText(text.slice(lastIndex))
		} else {
			this.inputEl.appendText('')
		}
		
		this.setCaretPosition(caretPos)
		this.isUpdatingInput = false
	}

	private renderToolsSection() {
		const toolsContainer = this.contentEl.createDiv('lonely-assistant-tools')
		const toolsHeader = toolsContainer.createDiv('lonely-assistant-tools-header')
		toolsHeader.createSpan({ text: 'Available Tools' })
		
		const toolsCollapseButton = toolsHeader.createEl('button', {
			cls: 'lonely-assistant-tools-collapse-button',
			attr: { 'aria-label': 'Toggle Tools' }
		})
		toolsCollapseButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`
		
		const toolsList = toolsContainer.createDiv('lonely-assistant-tools-list')
		toolsContainer.classList.add('is-collapsed')
		
		toolsCollapseButton.addEventListener('click', () => {
			toolsContainer.classList.toggle('is-collapsed')
			if (toolsContainer.classList.contains('is-collapsed')) {
				toolsCollapseButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`
			} else {
				toolsCollapseButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`
			}
		})
		
		const tools = this.plugin.toolRegistry.getAvailableTools()
		
		if (tools.length === 0) {
			toolsList.createEl('div', { 
				cls: 'lonely-assistant-tools-empty',
				text: 'No tools enabled. Enable tools in settings.' 
			})
			return
		}
		
		for (const tool of tools) {
			const toolItem = toolsList.createDiv('lonely-assistant-tool-item')
			
			const toolIcon = toolItem.createSpan({ cls: 'lonely-assistant-tool-icon' })
			setIcon(toolIcon, this.getToolIcon(tool.name))
			
			const toolInfo = toolItem.createDiv('lonely-assistant-tool-info')
			toolInfo.createEl('div', { cls: 'lonely-assistant-tool-name', text: tool.name })
			toolInfo.createEl('div', { cls: 'lonely-assistant-tool-description', text: tool.description })
		}
	}

	private getToolIcon(toolName: string): string {
		const icons: Record<string, string> = {
			'find': 'search',
			'grep': 'search',
			'read': 'file-text',
			'apply_patch': 'edit',
			'web_search': 'globe',
			'web_fetch': 'globe'
		}
		return icons[toolName] || 'wrench'
	}

	private formatToolName(name: string): string {
		const nameMap: Record<string, string> = {
			'find': 'Find Tool',
			'grep': 'Grep Tool',
			'read': 'Read File',
			'apply_patch': 'Apply Patch',
			'web_search': 'Web Search',
			'web_fetch': 'Web Fetch'
		}
		return nameMap[name] || name.split('_').map(word => 
			word.charAt(0).toUpperCase() + word.slice(1)
		).join(' ')
	}

	private renderToolParams(container: HTMLElement, params: Record<string, unknown>): void {
		const paramsList = container.createDiv({ cls: 'lonely-assistant-tool-params' })
		
		for (const [key, value] of Object.entries(params)) {
			const paramRow = paramsList.createDiv({ cls: 'lonely-assistant-tool-param-row' })
			paramRow.createSpan({ cls: 'lonely-assistant-tool-param-key', text: key + ':' })
			
			const valueSpan = paramRow.createSpan({ cls: 'lonely-assistant-tool-param-value' })
			if (typeof value === 'string') {
				valueSpan.setText(value)
			} else if (typeof value === 'object' && value !== null) {
				valueSpan.setText(JSON.stringify(value))
			} else {
				valueSpan.setText(String(value))
			}
		}
	}
}
