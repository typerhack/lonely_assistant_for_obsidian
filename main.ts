import { App, Plugin, PluginSettingTab, Setting, Notice, WorkspaceLeaf, Editor } from 'obsidian'
import { LonelyAssistantView, VIEW_TYPE_LONELY_ASSISTANT } from './src/LonelyAssistantView'
import { OllamaClient } from './src/OllamaClient'
import { LonelyAssistantSettings, mergeSettings, DEFAULT_SETTINGS } from './src/settings'
import { RAGService } from './src/rag'
import { previewAndApplySelection } from './src/editing'

export default class LonelyAssistantPlugin extends Plugin {
	settings: LonelyAssistantSettings
	ollamaClient: OllamaClient
	availableModels: string[] = []
	modelLoadError: string | null = null
	ragService: RAGService

	async onload() {
		await this.loadSettings()

		this.ollamaClient = new OllamaClient(this.settings.ollamaHost)
		await this.refreshModels()

		this.ragService = new RAGService(this)
		await this.ragService.initialize()

		// Register the sidebar view
		this.registerView(VIEW_TYPE_LONELY_ASSISTANT, (leaf) => new LonelyAssistantView(leaf, this))

		// Add ribbon icon to open sidebar
		this.addRibbonIcon('message-square', 'Lonely Assistant', () => {
			this.activateView()
		})

		// Add command to ask model
		this.addCommand({
			id: 'ask-model',
			name: 'Ask Model',
			editorCallback: async (editor: Editor) => {
				const selection = editor.getSelection()
				const content = selection.trim() ? selection : editor.getValue()
				await this.askModel(content)
			},
			callback: async () => {
				await this.askModel()
			},
		})

		this.addCommand({
			id: 'apply-last-response-to-selection',
			name: 'Apply Last Response to Selection',
			editorCallback: async (editor: Editor) => {
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LONELY_ASSISTANT)
				if (!leaves.length) {
					new Notice('Open Lonely Assistant before applying a response')
					return
				}
				const view = leaves[0].view as LonelyAssistantView
				const response = view.getLastAssistantResponse()
				if (!response) {
					new Notice('No assistant response available to apply')
					return
				}
				await previewAndApplySelection(this.app, editor, response, 'Apply Lonely Assistant response')
			},
		})

		// Add settings tab
		this.addSettingTab(new LonelyAssistantSettingTab(this.app, this))
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_LONELY_ASSISTANT)
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
		if (this.ragService) {
			await this.ragService.setEnabled(this.settings.ragEnabled)
		}
	}

	async activateView() {
		const { workspace } = this.app

		let leaf: WorkspaceLeaf | null = null
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_LONELY_ASSISTANT)

		if (leaves.length > 0) {
			leaf = leaves[0]
		} else {
			leaf = workspace.getRightLeaf(false)
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_LONELY_ASSISTANT,
					active: true,
				})
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf)
		}
	}

	async askModel(input?: string) {
		const trimmedInput = input?.trim()
		const activeFile = this.app.workspace.getActiveFile()
		let content = trimmedInput

		if (!content) {
			if (!activeFile) {
				new Notice('No active file or selection to send to model')
				return
			}

			content = await this.app.vault.read(activeFile)
		}

		await this.activateView()

		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LONELY_ASSISTANT)
		if (leaves.length === 0) {
			new Notice('Lonely Assistant view is not available')
			return
		}

		const view = leaves[0].view as LonelyAssistantView
		view.askModel(content)
	}

	async refreshModels(options: { showNotice?: boolean } = {}) {
		const { showNotice = false } = options
		try {
			this.modelLoadError = null
			const models = await this.ollamaClient.listModels()
			this.availableModels = models
			if (models.length && !models.includes(this.settings.model)) {
				this.settings.model = models[0]
				await this.saveSettings()
			}
			if (showNotice) {
				new Notice(`Loaded ${models.length} model${models.length === 1 ? '' : 's'} from Ollama`)
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.modelLoadError = message
			this.availableModels = []
			if (showNotice) {
				new Notice(`Failed to load models: ${message}`)
			}
		}
	}
}

class LonelyAssistantSettingTab extends PluginSettingTab {
	plugin: LonelyAssistantPlugin

	constructor(app: App, plugin: LonelyAssistantPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this

		containerEl.empty()

		containerEl.createEl('h2', { text: 'Lonely Assistant Settings' })

		new Setting(containerEl)
			.setName('Ollama Host')
			.setDesc('URL of your Ollama server (default: http://localhost:11434)')
			.addText(text => {
			text.setPlaceholder(DEFAULT_SETTINGS.ollamaHost)
			text.setValue(this.plugin.settings.ollamaHost)
			text.onChange((value) => {
				this.plugin.settings.ollamaHost = value
			})
			text.inputEl.addEventListener('blur', async () => {
				const rawHost = this.plugin.settings.ollamaHost
				const normalizedHost = rawHost.trim() || DEFAULT_SETTINGS.ollamaHost
				if (normalizedHost !== rawHost) {
					this.plugin.settings.ollamaHost = normalizedHost
					text.setValue(normalizedHost)
				}
				await this.plugin.saveSettings()
				this.plugin.ollamaClient = new OllamaClient(this.plugin.settings.ollamaHost)
				await this.plugin.refreshModels({ showNotice: true })
				this.display()
			})
		})

		const modelSetting = new Setting(containerEl)
			.setName('Model')
			.setDesc(this.plugin.modelLoadError ? `Unable to load models: ${this.plugin.modelLoadError}` : 'Default Ollama model to use')

		modelSetting.addDropdown(dropdown => {
			const models = this.plugin.availableModels
			const currentModel = this.plugin.settings.model

			if (!models.length) {
				const label = this.plugin.modelLoadError ? 'Unavailable' : 'No models found'
				dropdown.addOption('', label)
				if (currentModel) {
					dropdown.addOption(currentModel, `${currentModel} (saved)`)
					dropdown.setValue(currentModel)
				} else {
					dropdown.setValue('')
				}
				dropdown.setDisabled(true)
				return
			}

			for (const model of models) {
				dropdown.addOption(model, model)
			}

			if (currentModel && !models.includes(currentModel)) {
				dropdown.addOption(currentModel, `${currentModel} (custom)`)
			}

			dropdown.setValue(currentModel && currentModel.length ? currentModel : models[0])
			dropdown.onChange(async (value) => {
				if (!value) {
					return
				}
				this.plugin.settings.model = value
				await this.plugin.saveSettings()
			})
		})

		modelSetting.addExtraButton(button => {
			button.setIcon('refresh-ccw')
			button.setTooltip('Refresh model list')
			button.onClick(async () => {
				button.setDisabled(true)
				await this.plugin.refreshModels({ showNotice: true })
				button.setDisabled(false)
				this.display()
			})
		})

		if (!this.plugin.modelLoadError && !this.plugin.availableModels.length) {
			modelSetting.descEl.createEl('div', { text: 'Click refresh after your Ollama models are downloaded.' })
		}

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Controls randomness (0.0 = deterministic, 1.0 = very random)')
			.addSlider(slider => slider
				.setLimits(0, 2, 0.1)
				.setValue(this.plugin.settings.temperature)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.temperature = value
					await this.plugin.saveSettings()
				}))

		new Setting(containerEl)
			.setName('Max Tokens')
			.setDesc('Maximum number of tokens to generate')
			.addText(text => {
				text.setPlaceholder(DEFAULT_SETTINGS.maxTokens.toString())
				text.setValue(this.plugin.settings.maxTokens.toString())
				text.inputEl.type = 'number'
				text.inputEl.min = '1'
				text.inputEl.step = '1'
				text.onChange(async (value) => {
					const numValue = parseInt(value, 10)
					if (Number.isNaN(numValue)) {
						return
					}
					this.plugin.settings.maxTokens = numValue
					await this.plugin.saveSettings()
				})
			})

		const promptSetting = new Setting(containerEl)
			.setName('Default Prompt')
			.setDesc('Default system prompt for the AI')

		promptSetting.addTextArea(text => {
			text.setPlaceholder('You are a helpful AI assistant...')
			text.setValue(this.plugin.settings.defaultPrompt)
			text.inputEl.rows = 6
			text.inputEl.spellcheck = false
			text.inputEl.classList.add('lonely-assistant-settings-textarea')
			text.onChange(async (value) => {
				this.plugin.settings.defaultPrompt = value
				await this.plugin.saveSettings()
			})
		})

		containerEl.createEl('h3', { text: 'Context & Retrieval (RAG)' })

		new Setting(containerEl)
			.setName('Enable context retrieval')
			.setDesc('Toggle Retrieval Augmented Generation (RAG) to inject relevant note snippets into prompts')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.ragEnabled)
				toggle.onChange(async (value) => {
					this.plugin.settings.ragEnabled = value
					await this.plugin.saveSettings()
					if (value) {
						await this.plugin.ragService.initialize()
					}
				})
			})

		new Setting(containerEl)
			.setName('Max context snippets')
			.setDesc('Total number of chunks (active + retrieved) to include with each request')
			.addSlider(slider => {
				slider.setLimits(1, 8, 1)
				slider.setValue(this.plugin.settings.ragMaxContext)
				slider.setDynamicTooltip()
				slider.onChange(async (value) => {
					this.plugin.settings.ragMaxContext = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(containerEl)
			.setName('Exclude folders')
			.setDesc('Comma-separated folder prefixes to skip when indexing (example: Templates, Private)')
			.addTextArea(text => {
				text.setPlaceholder('Templates, Private')
				text.setValue(this.plugin.settings.ragExcludeFolders.join(', '))
				text.inputEl.rows = 3
				text.onChange(async (value) => {
					this.plugin.settings.ragExcludeFolders = value
						.split(',')
						.map((entry) => entry.trim())
						.filter(Boolean)
					await this.plugin.saveSettings()
				})
				text.inputEl.addEventListener('blur', () => {
					void this.plugin.ragService.rebuildIndex()
				})
			})

		new Setting(containerEl)
			.setName('Rebuild / Clear index')
			.setDesc('Rebuild the RAG index or clear it from disk')
			.addButton(button => {
				button.setButtonText('Rebuild index')
				button.onClick(async () => {
					await this.plugin.ragService.rebuildIndex()
					new Notice('Rebuilt Lonely Assistant index')
				})
			})
			.addExtraButton(button => {
				button.setIcon('trash')
				button.setTooltip('Clear stored index')
				button.onClick(async () => {
					await this.plugin.ragService.clearIndex()
					new Notice('Cleared Lonely Assistant index')
				})
			})
	}
}
