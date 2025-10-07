import { Tool, ToolProvider, ToolResult, ToolExecutionLog, ToolSettings } from './types'
import { ConsentManager } from './ConsentManager'
import { AuditLogger } from './AuditLogger'
import { RateLimiter } from './RateLimiter'
import { App } from 'obsidian'
import { Logger } from '../logger'

export class ToolRegistry {
	private providers: Map<string, ToolProvider> = new Map()
	private tools: Map<string, Tool> = new Map()
	private consentManager: ConsentManager
	private auditLogger: AuditLogger
	private rateLimiter: RateLimiter
	
	constructor(
		private app: App,
		private settings: ToolSettings,
		private onSettingsChange: () => Promise<void>
	) {
		this.consentManager = new ConsentManager(app, settings)
		this.auditLogger = new AuditLogger(app, settings)
		this.rateLimiter = new RateLimiter(settings)
	}
	
	async initialize(): Promise<void> {
		await this.auditLogger.initialize()
	}
	
	async shutdown(): Promise<void> {
		for (const provider of this.providers.values()) {
			await provider.shutdown()
		}
		await this.auditLogger.shutdown()
	}
	
	async registerProvider(provider: ToolProvider): Promise<void> {
		if (this.providers.has(provider.id)) {
			throw new Error(`Provider ${provider.id} is already registered`)
		}
		
		await provider.initialize()
		this.providers.set(provider.id, provider)
		
		for (const tool of provider.tools) {
			if (this.tools.has(tool.name)) {
				throw new Error(`Tool ${tool.name} is already registered`)
			}
			this.tools.set(tool.name, tool)
		}
	}
	
	async unregisterProvider(providerId: string): Promise<void> {
		const provider = this.providers.get(providerId)
		if (!provider) {
			return
		}
		
		await provider.shutdown()
		
		for (const tool of provider.tools) {
			this.tools.delete(tool.name)
		}
		
		this.providers.delete(providerId)
	}
	
	getAvailableTools(): Tool[] {
		return Array.from(this.tools.values()).filter(tool => 
			this.settings.enabledTools.includes(tool.name)
		)
	}
	
	getTool(name: string): Tool | undefined {
		return this.tools.get(name)
	}
	
	async executeWithConsent(
		toolName: string,
		params: Record<string, unknown>
	): Promise<ToolResult> {
		const tool = this.getTool(toolName)
		if (!tool) {
			return {
				success: false,
				error: `Tool '${toolName}' not found`
			}
		}
		
		if (!this.settings.enabledTools.includes(toolName)) {
			return {
				success: false,
				error: `Tool '${toolName}' is not enabled`
			}
		}
		
		if (this.settings.blockExternalRequests && this.isNetworkTool(tool)) {
			return {
				success: false,
				error: 'External network requests are blocked in settings'
			}
		}
		
		const hasConsent = await this.consentManager.requestConsent(tool, params)
		if (!hasConsent) {
			await this.auditLogger.logConsentDenied(tool, params)
			return {
				success: false,
				error: 'User denied consent for tool execution'
			}
		}
		
		const canExecute = await this.rateLimiter.checkLimit(toolName)
		if (!canExecute) {
			return {
				success: false,
				error: `Rate limit exceeded for tool '${toolName}'. Please wait and try again.`
			}
		}
		
		const startTime = Date.now()
		Logger.info('Tool request', { tool: toolName, params })
		let result: ToolResult
		
		try {
			result = await tool.execute(params)
			result.executionId = result.executionId || this.generateExecutionId()
		} catch (error) {
			result = {
				success: false,
				error: error instanceof Error ? error.message : String(error)
			}
		}
		
		const duration = Date.now() - startTime
		
		await this.auditLogger.logExecution({
			timestamp: new Date().toISOString(),
			tool: toolName,
			executionId: result.executionId || 'unknown',
			parameters: params,
			result,
			duration
		})
		Logger.info('Tool result', { tool: toolName, success: result.success, duration })
		
		return result
	}
	
	async undo(toolName: string, executionId: string): Promise<ToolResult> {
		const tool = this.getTool(toolName)
		if (!tool) {
			return {
				success: false,
				error: `Tool '${toolName}' not found`
			}
		}
		
		if (!tool.undo) {
			return {
				success: false,
				error: `Tool '${toolName}' does not support undo`
			}
		}
		
		try {
			await tool.undo(executionId)
			await this.auditLogger.logUndo(toolName, executionId)
			return { success: true }
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error)
			}
		}
	}
	
	getExecutionLogs(limit?: number): Promise<ToolExecutionLog[]> {
		return this.auditLogger.getLogs(limit)
	}
	
	async clearLogs(): Promise<void> {
		await this.auditLogger.clearLogs()
	}
	
	updateSettings(settings: ToolSettings): void {
		this.settings = settings
		this.consentManager.updateSettings(settings)
		this.auditLogger.updateSettings(settings)
		this.rateLimiter.updateSettings(settings)
	}
	
	private isNetworkTool(tool: Tool): boolean {
		return tool.name === 'web_search' || tool.name === 'web_fetch'
	}
	
	private generateExecutionId(): string {
		return `exec-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
	}
}
