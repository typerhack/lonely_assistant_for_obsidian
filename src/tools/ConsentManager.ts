import { App, Modal } from 'obsidian'
import { Tool, ToolSettings, ConsentMode, ConsentRequest, ConsentResponse } from './types'

export class ConsentDialog extends Modal {
	private tool: Tool
	private parameters: Record<string, unknown>
	private preview?: string
	private onResult: (response: ConsentResponse) => void
	
	constructor(
		app: App,
		request: ConsentRequest,
		onResult: (response: ConsentResponse) => void
	) {
		super(app)
		this.tool = request.tool
		this.parameters = request.parameters
		this.preview = request.preview
		this.onResult = onResult
	}
	
	onOpen(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass('lonely-assistant-consent-dialog')
		
		const header = contentEl.createDiv({ cls: 'consent-header' })
		const icon = this.getRiskIcon(this.tool.riskLevel)
		const titleText = icon ? `${icon} ${this.tool.name}` : this.tool.name
		header.createSpan({ text: titleText, cls: 'consent-title' })
		header.createSpan({ text: this.tool.riskLevel.toUpperCase(), cls: `consent-badge consent-badge-${this.tool.riskLevel}` })
		
		contentEl.createEl('p', { text: this.tool.description, cls: 'consent-description' })
		
		const paramsSection = contentEl.createDiv({ cls: 'consent-params' })
		paramsSection.createEl('h4', { text: 'Parameters:' })
		const paramsCode = paramsSection.createEl('pre')
		paramsCode.createEl('code', { text: JSON.stringify(this.parameters, null, 2) })
		
		if (this.preview) {
			const previewSection = contentEl.createDiv({ cls: 'consent-preview' })
			previewSection.createEl('h4', { text: 'Preview:' })
			const previewCode = previewSection.createEl('pre')
			previewCode.createEl('code', { text: this.preview })
		}
		
		const buttons = contentEl.createDiv({ cls: 'consent-buttons' })
		
		const allowOnce = buttons.createEl('button', { text: 'Allow Once' })
		allowOnce.addEventListener('click', () => {
			this.onResult({ approved: true, mode: 'once' })
			this.close()
		})
		
		if (this.tool.canBypass) {
			const allowSession = buttons.createEl('button', { text: 'Allow for Session' })
			allowSession.addEventListener('click', () => {
				this.onResult({ approved: true, mode: 'session' })
				this.close()
			})
			
			const alwaysAllow = buttons.createEl('button', { text: 'Always Allow' })
			alwaysAllow.addEventListener('click', () => {
				this.onResult({ approved: true, mode: 'always' })
				this.close()
			})
		}
		
		const deny = buttons.createEl('button', { text: 'Deny', cls: 'mod-warning' })
		deny.addEventListener('click', () => {
			this.onResult({ approved: false, mode: 'once' })
			this.close()
		})
		
		if (!this.tool.canBypass && this.tool.riskLevel === 'high') {
			const warning = contentEl.createDiv({ cls: 'consent-warning' })
			warning.createSpan({ text: 'Warning: Always Allow is disabled for this tool' })
		}
	}
	
	onClose(): void {
		const { contentEl } = this
		contentEl.empty()
	}
	
	private getRiskIcon(riskLevel: string): string {
		switch (riskLevel) {
			case 'safe': return ''
			case 'low': return ''
			case 'medium': return ''
			case 'high': return ''
			default: return ''
		}
	}
}

export class ConsentManager {
	private sessionConsent: Set<string> = new Set()
	
	constructor(
		private app: App,
		private settings: ToolSettings
	) {}
	
	async requestConsent(tool: Tool, params: Record<string, unknown>): Promise<boolean> {
		const mode = this.getConsentMode(tool.name)

		// Hard blocks
		if (mode === 'never_allow') return false

		// Dev mode can bypass safe tools
		if (this.settings.developerMode && tool.riskLevel === 'safe') return true

		// Always allow (only for bypassable tools)
		if (mode === 'always_allow' && tool.canBypass) return true

		// Session allow – grant if previously approved in this session
		if (mode === 'session_allow' && this.sessionConsent.has(tool.name)) return true

		// For session_allow without prior consent, or always_ask, or non-bypassable tools -> ask
		if (mode === 'session_allow' || mode === 'always_ask' || !tool.canBypass) {
			return await this.showConsentDialog(tool, params)
		}

		// Default deny if none matched
		return false
	}
	
	private async showConsentDialog(tool: Tool, params: Record<string, unknown>): Promise<boolean> {
		let preview: string | undefined
		if (tool.preview && tool.requiresPreview) {
			try {
				preview = await tool.preview(params)
			} catch (error) {
				preview = `Preview failed: ${error instanceof Error ? error.message : String(error)}`
			}
		}
		
		return new Promise<boolean>((resolve) => {
			const dialog = new ConsentDialog(
				this.app,
				{
					tool,
					parameters: params,
					preview,
					riskLevel: tool.riskLevel,
					canBypass: tool.canBypass
				},
				(response) => {
					if (response.approved) {
						if (response.mode === 'session') {
							this.sessionConsent.add(tool.name)
						} else if (response.mode === 'always') {
							this.settings.consentMode[tool.name] = 'always_allow'
						}
						resolve(true)
					} else {
						if (response.mode === 'never') {
							this.settings.consentMode[tool.name] = 'never_allow'
						}
						resolve(false)
					}
				}
			)
			dialog.open()
		})
	}
	
	private getConsentMode(toolName: string): ConsentMode {
		return this.settings.consentMode[toolName] || 'always_ask'
	}
	
	clearSessionConsent(): void {
		this.sessionConsent.clear()
	}
	
	updateSettings(settings: ToolSettings): void {
		this.settings = settings
	}
}
