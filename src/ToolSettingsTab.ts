import { Setting } from 'obsidian'
import { ConsentMode } from './tools/types'
import LonelyAssistantPlugin from '../main'

export class ToolSettingsSection {
	constructor(
		private containerEl: HTMLElement,
		private plugin: LonelyAssistantPlugin
	) {}


	display(): void {
		this.containerEl.addClass('lonely-assistant-tools-settings')
		// Tabs header
		const tabs = this.containerEl.createDiv({ cls: 'la-tool-tabs' })
		const content = this.containerEl.createDiv({ cls: 'la-tool-tabs-content' })
		
		const sections: { id: string; label: string; render: (el: HTMLElement) => void }[] = [
			{ id: 'manage', label: 'Management', render: el => this.displayToolManagementSection(el) },
			{ id: 'apis', label: 'External APIs', render: el => this.displayExternalAPIsSection(el) },
			{ id: 'network', label: 'Network', render: el => this.displayNetworkSecuritySection(el) },
			{ id: 'perf', label: 'Performance', render: el => this.displayPerformanceSection(el) },
			{ id: 'privacy', label: 'Privacy & Audit', render: el => this.displayPrivacyAuditSection(el) },
			{ id: 'specific', label: 'Tool-specific', render: el => this.displayToolSpecificSection(el) },
		]
		
		const containers = new Map<string, HTMLElement>()
		
		for (const sec of sections) {
			const btn = tabs.createEl('button', { cls: 'la-tool-tab', text: sec.label })
			const panel = content.createDiv({ cls: 'la-tool-tab-panel' })
			containers.set(sec.id, panel)
			sec.render(panel)
			btn.addEventListener('click', () => select(sec.id))
		}
		
		const select = (id: string) => {
			for (const [sid, panel] of containers) {
				panel.toggleClass('is-active', sid === id)
			}
			Array.from(tabs.children).forEach(child => child.toggleClass('is-active', (child as HTMLButtonElement).textContent === sections.find(s=>s.id===id)?.label))
		}
		
		select('manage')
	}

	private displayToolManagementSection(container: HTMLElement = this.containerEl): void {
		container.empty()
		container.createEl('h3', { text: 'Tool Management' })

		new Setting(container)
			.setName('Enabled Tools')
			.setDesc('Select which tools are available to the AI')
			.setHeading()

		const tools = [
			{ id: 'find', name: 'Find Tool', desc: 'Search vault by name' },
			{ id: 'grep', name: 'Grep Tool', desc: 'Search file contents' },
			{ id: 'read', name: 'Read Tool', desc: 'Read file contents' },
			{ id: 'apply_patch', name: 'Apply Patch Tool', desc: 'Modify files' },
			{ id: 'web_search', name: 'Web Search Tool', desc: 'Search the web' },
			{ id: 'web_fetch', name: 'Web Fetch Tool', desc: 'Fetch web pages' }
		]

		tools.forEach(tool => {
			new Setting(container)
				.setName(tool.name)
				.setDesc(tool.desc)
				.addToggle(toggle => {
					toggle.setValue(this.plugin.settings.tools.enabledTools.includes(tool.id))
					toggle.onChange(async (value) => {
						if (value) {
							if (!this.plugin.settings.tools.enabledTools.includes(tool.id)) {
								this.plugin.settings.tools.enabledTools.push(tool.id)
							}
						} else {
							this.plugin.settings.tools.enabledTools = 
								this.plugin.settings.tools.enabledTools.filter(t => t !== tool.id)
						}
						await this.plugin.saveSettings()
					})
				})
		})

		new Setting(container)
			.setName('Consent Preferences')
			.setDesc('Choose how to handle permission requests')
			.setHeading()

		const consentModes: { value: ConsentMode; label: string }[] = [
			{ value: 'always_ask', label: 'Always Ask' },
			{ value: 'session_allow', label: 'Session Allow' },
			{ value: 'always_allow', label: 'Always Allow' },
			{ value: 'never_allow', label: 'Never Allow' }
		]

		tools.forEach(tool => {
			new Setting(this.containerEl)
				.setName(tool.name)
				.addDropdown(dropdown => {
					consentModes.forEach(mode => {
						dropdown.addOption(mode.value, mode.label)
					})
					dropdown.setValue(this.plugin.settings.tools.consentMode[tool.id] || 'always_ask')
					dropdown.onChange(async (value: string) => {
						this.plugin.settings.tools.consentMode[tool.id] = value as ConsentMode
						await this.plugin.saveSettings()
					})
				})
		})

		new Setting(this.containerEl)
			.setName('Developer Mode')
			.setDesc('Bypass consent for safe tools (read-only operations)')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.developerMode)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.developerMode = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(this.containerEl)
			.setName('Print logs to console')
			.setDesc('If enabled, Lonely Assistant will log actions and tool activity to the developer console')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.printLogs)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.printLogs = value
					await this.plugin.saveSettings()
				})
			})
	}

	private displayExternalAPIsSection(container: HTMLElement = this.containerEl): void {
		container.empty()
		container.createEl('h3', { text: 'External APIs' })

		new Setting(container)
			.setName('Ollama Web Search Endpoint')
			.setDesc('Ollama server URL for web search')
			.addText(text => {
				text.setPlaceholder('http://localhost:11434')
				text.setValue(this.plugin.settings.tools.ollamaWebSearchEndpoint)
				text.onChange(async (value) => {
					this.plugin.settings.tools.ollamaWebSearchEndpoint = value || 'http://localhost:11434'
					await this.plugin.saveSettings()
				})
			})

		new Setting(container)
			.setName('Ollama API Key')
			.setDesc('Optional API key for Ollama web search (required for cloud/hosted instances)')
			.addText(text => {
				text.setPlaceholder('Enter API key')
				text.setValue(this.plugin.settings.tools.ollamaApiKey || '')
				text.inputEl.type = 'password'
				text.onChange(async (value) => {
					this.plugin.settings.tools.ollamaApiKey = value || undefined
					await this.plugin.saveSettings()
				})
			})
	}

	private displayNetworkSecuritySection(container: HTMLElement = this.containerEl): void {
		container.empty()
		container.createEl('h3', { text: 'Network Security' })

		new Setting(container)
			.setName('Allowed Domains')
			.setDesc('Domains that can be accessed by web fetch tool')
			.setHeading()

		const domainListEl = this.containerEl.createEl('div', { cls: 'tool-domain-list' })
		this.renderDomainList(domainListEl)

		new Setting(container)
			.setName('Add Domain')
			.addText(text => {
				text.setPlaceholder('example.com')
				const addButton = text.inputEl.parentElement?.createEl('button', { text: 'Add' })
				if (addButton) {
					addButton.onclick = async () => {
						const domain = text.getValue().trim()
						if (domain && !this.plugin.settings.tools.allowedDomains.includes(domain)) {
							this.plugin.settings.tools.allowedDomains.push(domain)
							await this.plugin.saveSettings()
							text.setValue('')
							this.renderDomainList(domainListEl)
						}
					}
				}
			})

		new Setting(container)
			.setName('Allow All Domains')
			.setDesc('Warning: Security risk - Allow fetching from any domain')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.allowAllDomains)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.allowAllDomains = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(container)
			.setName('Block External Requests')
			.setDesc('Completely disable all network requests')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.blockExternalRequests)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.blockExternalRequests = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(container)
			.setName('Enforce HTTPS Only')
			.setDesc('Only allow HTTPS connections (recommended)')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.httpsOnly)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.httpsOnly = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(this.containerEl)
			.setName('Max Response Size')
			.setDesc('Maximum response size in MB')
			.addText(text => {
				text.setPlaceholder('10')
				text.setValue((this.plugin.settings.tools.maxResponseSize / 1048576).toString())
				text.inputEl.type = 'number'
				text.onChange(async (value) => {
					const mb = parseFloat(value)
					if (!isNaN(mb) && mb > 0) {
						this.plugin.settings.tools.maxResponseSize = Math.floor(mb * 1048576)
						await this.plugin.saveSettings()
					}
				})
			})
	}

	private renderDomainList(containerEl: HTMLElement): void {
		containerEl.empty()
		this.plugin.settings.tools.allowedDomains.forEach(domain => {
			const domainEl = containerEl.createEl('div', { cls: 'tool-domain-item' })
			domainEl.createEl('span', { text: domain })
			const removeBtn = domainEl.createEl('button', { text: 'Remove', cls: 'tool-domain-remove' })
			removeBtn.onclick = async () => {
				this.plugin.settings.tools.allowedDomains = 
					this.plugin.settings.tools.allowedDomains.filter(d => d !== domain)
				await this.plugin.saveSettings()
				this.renderDomainList(containerEl)
			}
		})
	}

	private displayPerformanceSection(container: HTMLElement = this.containerEl): void {
		container.empty()
		container.createEl('h3', { text: 'Performance' })

		new Setting(container)
			.setName('Enable Response Caching')
			.setDesc('Cache API responses to improve performance')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.cacheEnabled)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.cacheEnabled = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(container)
			.setName('Cache TTL')
			.setDesc('Cache time-to-live in seconds')
			.addText(text => {
				text.setPlaceholder('3600')
				text.setValue(this.plugin.settings.tools.cacheTTL.toString())
				text.inputEl.type = 'number'
				text.onChange(async (value) => {
					const ttl = parseInt(value)
					if (!isNaN(ttl) && ttl > 0) {
						this.plugin.settings.tools.cacheTTL = ttl
						await this.plugin.saveSettings()
					}
				})
			})

		new Setting(container)
			.setName('Max Cache Size')
			.setDesc('Maximum cache size in MB')
			.addText(text => {
				text.setPlaceholder('100')
				text.setValue((this.plugin.settings.tools.maxCacheSize / 1048576).toString())
				text.inputEl.type = 'number'
				text.onChange(async (value) => {
					const mb = parseFloat(value)
					if (!isNaN(mb) && mb > 0) {
						this.plugin.settings.tools.maxCacheSize = Math.floor(mb * 1048576)
						await this.plugin.saveSettings()
					}
				})
			})

		new Setting(container)
			.setName('Rate Limits')
			.setDesc('Requests per minute for each tool')
			.setHeading()

		const rateLimitTools = [
			{ id: 'find', name: 'Find Tool' },
			{ id: 'grep', name: 'Grep Tool' },
			{ id: 'read', name: 'Read Tool' },
			{ id: 'apply_patch', name: 'Apply Patch' },
			{ id: 'web_search', name: 'Web Search' },
			{ id: 'web_fetch', name: 'Web Fetch' }
		]

		rateLimitTools.forEach(tool => {
			new Setting(this.containerEl)
				.setName(tool.name)
				.addText(text => {
					text.setPlaceholder('100')
					text.setValue(this.plugin.settings.tools.rateLimits[tool.id]?.toString() || '100')
					text.inputEl.type = 'number'
					text.inputEl.style.width = '80px'
					text.onChange(async (value) => {
						const limit = parseInt(value)
						if (!isNaN(limit) && limit > 0 && limit <= 1000) {
							this.plugin.settings.tools.rateLimits[tool.id] = limit
							await this.plugin.saveSettings()
						}
					})
				})
		})

		new Setting(this.containerEl)
			.setName('Global Rate Limit')
			.setDesc('Maximum requests per minute across all tools')
			.addText(text => {
				text.setPlaceholder('200')
				text.setValue(this.plugin.settings.tools.globalRateLimit.toString())
				text.inputEl.type = 'number'
				text.onChange(async (value) => {
					const limit = parseInt(value)
					if (!isNaN(limit) && limit > 0) {
						this.plugin.settings.tools.globalRateLimit = limit
						await this.plugin.saveSettings()
					}
				})
			})
	}

	private displayPrivacyAuditSection(container: HTMLElement = this.containerEl): void {
		container.empty()
		container.createEl('h3', { text: 'Privacy & Audit' })

		new Setting(container)
			.setName('Enable Audit Log')
			.setDesc('Log all tool executions for security audit')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.enableAuditLog)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.enableAuditLog = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(container)
			.setName('Audit Log Retention')
			.setDesc('Number of days to keep audit logs')
			.addText(text => {
				text.setPlaceholder('30')
				text.setValue(this.plugin.settings.tools.auditLogRetentionDays.toString())
				text.inputEl.type = 'number'
				text.onChange(async (value) => {
					const days = parseInt(value)
					if (!isNaN(days) && days > 0) {
						this.plugin.settings.tools.auditLogRetentionDays = days
						await this.plugin.saveSettings()
					}
				})
			})

		new Setting(container)
			.setName('Log Parameter Values')
			.setDesc('Include parameter values in audit logs')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.logParameterValues)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.logParameterValues = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(container)
			.setName('Anonymize Logs')
			.setDesc('Redact file paths in audit logs')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.anonymizeLog)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.anonymizeLog = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(container)
			.setName('Share Usage Statistics')
			.setDesc('Share anonymous usage data for improvement')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.shareUsageStatistics)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.shareUsageStatistics = value
					await this.plugin.saveSettings()
				})
			})
	}

	private displayToolSpecificSection(container: HTMLElement = this.containerEl): void {
		container.empty()
		container.createEl('h3', { text: 'Tool-Specific Settings' })

		new Setting(container)
			.setName('Find Tool: Max Results')
			.setDesc('Maximum number of files to return')
			.addText(text => {
				text.setPlaceholder('50')
				text.setValue(this.plugin.settings.tools.findMaxResults.toString())
				text.inputEl.type = 'number'
				text.onChange(async (value) => {
					const max = parseInt(value)
					if (!isNaN(max) && max > 0) {
						this.plugin.settings.tools.findMaxResults = max
						await this.plugin.saveSettings()
					}
				})
			})

		new Setting(container)
			.setName('Grep Tool: Context Lines')
			.setDesc('Number of context lines around matches')
			.addText(text => {
				text.setPlaceholder('2')
				text.setValue(this.plugin.settings.tools.grepContextLines.toString())
				text.inputEl.type = 'number'
				text.onChange(async (value) => {
					const lines = parseInt(value)
					if (!isNaN(lines) && lines >= 0) {
						this.plugin.settings.tools.grepContextLines = lines
						await this.plugin.saveSettings()
					}
				})
			})

		new Setting(container)
			.setName('Read Tool: Max File Size')
			.setDesc('Maximum file size in MB')
			.addText(text => {
				text.setPlaceholder('1')
				text.setValue((this.plugin.settings.tools.readMaxBytes / 1048576).toString())
				text.inputEl.type = 'number'
				text.onChange(async (value) => {
					const mb = parseFloat(value)
					if (!isNaN(mb) && mb > 0) {
						this.plugin.settings.tools.readMaxBytes = Math.floor(mb * 1048576)
						await this.plugin.saveSettings()
					}
				})
			})

		new Setting(container)
			.setName('Apply Patch Tool: Create Backups')
			.setDesc('Automatically backup files before modifications')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.tools.patchBackupEnabled)
				toggle.onChange(async (value) => {
					this.plugin.settings.tools.patchBackupEnabled = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(container)
			.setName('Web Search Tool: Max Results')
			.setDesc('Maximum number of search results')
			.addText(text => {
				text.setPlaceholder('5')
				text.setValue(this.plugin.settings.tools.webSearchMaxResults.toString())
				text.inputEl.type = 'number'
				text.onChange(async (value) => {
					const max = parseInt(value)
					if (!isNaN(max) && max > 0) {
						this.plugin.settings.tools.webSearchMaxResults = max
						await this.plugin.saveSettings()
					}
				})
			})
	}
}
