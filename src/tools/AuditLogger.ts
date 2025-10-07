import { App } from 'obsidian'
import { Tool, ToolExecutionLog, ToolSettings } from './types'

export class AuditLogger {
	private logs: ToolExecutionLog[] = []
	private logFilePath: string
	
	constructor(
		private app: App,
		private settings: ToolSettings
	) {
		this.logFilePath = '.lonely-assistant/logs/tools.log'
	}
	
	async initialize(): Promise<void> {
		if (!this.settings.enableAuditLog) {
			return
		}
		
		await this.ensureLogDirectory()
		await this.loadLogs()
		await this.rotateLogsIfNeeded()
	}
	
	async shutdown(): Promise<void> {
		if (this.logs.length > 0) {
			await this.persistLogs()
		}
	}
	
	async logExecution(log: ToolExecutionLog): Promise<void> {
		if (!this.settings.enableAuditLog) {
			return
		}
		
		const sanitizedLog = this.sanitizeLog(log)
		this.logs.push(sanitizedLog)
		
		if (this.logs.length >= 100) {
			await this.persistLogs()
		}
	}
	
	async logConsentDenied(tool: Tool, params: Record<string, unknown>): Promise<void> {
		if (!this.settings.enableAuditLog) {
			return
		}
		
		await this.logExecution({
			timestamp: new Date().toISOString(),
			tool: tool.name,
			executionId: 'denied',
			parameters: params,
			result: { success: false, error: 'Consent denied' },
			duration: 0
		})
	}
	
	async logUndo(toolName: string, executionId: string): Promise<void> {
		if (!this.settings.enableAuditLog) {
			return
		}
		
		await this.logExecution({
			timestamp: new Date().toISOString(),
			tool: toolName,
			executionId: `undo-${executionId}`,
			parameters: { originalExecutionId: executionId },
			result: { success: true },
			duration: 0
		})
	}
	
	async getLogs(limit?: number): Promise<ToolExecutionLog[]> {
		const allLogs = [...this.logs]
		return limit ? allLogs.slice(-limit) : allLogs
	}
	
	async clearLogs(): Promise<void> {
		this.logs = []
		
		try {
			const logFile = this.app.vault.getAbstractFileByPath(this.logFilePath)
			if (logFile) {
				await this.app.vault.delete(logFile)
			}
		} catch (error) {
			console.error('Failed to clear logs:', error)
		}
	}
	
	updateSettings(settings: ToolSettings): void {
		this.settings = settings
	}
	
	private sanitizeLog(log: ToolExecutionLog): ToolExecutionLog {
		const sanitized = { ...log }
		
		if (!this.settings.logParameterValues) {
			sanitized.parameters = { _redacted: true }
		}
		
		if (this.settings.anonymizeLog) {
			sanitized.parameters = this.anonymizeParams(sanitized.parameters)
		}
		
		return sanitized
	}
	
	private anonymizeParams(params: Record<string, unknown>): Record<string, unknown> {
		const anonymized: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(params)) {
			if (key === 'path' || key === 'url') {
				anonymized[key] = '[REDACTED]'
			} else {
				anonymized[key] = value
			}
		}
		return anonymized
	}
	
	private async ensureLogDirectory(): Promise<void> {
		const adapter = this.app.vault.adapter
		const parentDir = '.lonely-assistant'
		const logsDir = '.lonely-assistant/logs'
		
		// Use adapter.mkdir which is safe if folder exists
		if (!(await adapter.exists(parentDir))) {
			await adapter.mkdir(parentDir)
		}
		
		if (!(await adapter.exists(logsDir))) {
			await adapter.mkdir(logsDir)
		}
	}
	
	private async loadLogs(): Promise<void> {
		try {
			const logFile = this.app.vault.getAbstractFileByPath(this.logFilePath)
			if (!logFile) {
				return
			}
			
			const content = await this.app.vault.read(logFile as never)
			const lines = content.split('\n').filter(line => line.trim())
			
			this.logs = lines.map(line => {
				try {
					return JSON.parse(line) as ToolExecutionLog
				} catch {
					return null
				}
			}).filter((log): log is ToolExecutionLog => log !== null)
			
			await this.pruneOldLogs()
		} catch (error) {
			console.error('Failed to load logs:', error)
			this.logs = []
		}
	}
	
	private async persistLogs(): Promise<void> {
		try {
			await this.ensureLogDirectory()
			
			const content = this.logs.map(log => JSON.stringify(log)).join('\n') + '\n'
			
			const logFile = this.app.vault.getAbstractFileByPath(this.logFilePath)
			if (logFile) {
				await this.app.vault.modify(logFile as never, content)
			} else {
				await this.app.vault.create(this.logFilePath, content)
			}
		} catch (error) {
			console.error('Failed to persist logs:', error)
		}
	}
	
	private async pruneOldLogs(): Promise<void> {
		if (this.settings.auditLogRetentionDays <= 0) {
			return
		}
		
		const cutoffDate = new Date()
		cutoffDate.setDate(cutoffDate.getDate() - this.settings.auditLogRetentionDays)
		
		this.logs = this.logs.filter(log => {
			const logDate = new Date(log.timestamp)
			return logDate >= cutoffDate
		})
	}
	
	private async rotateLogsIfNeeded(): Promise<void> {
		try {
			const logFile = this.app.vault.getAbstractFileByPath(this.logFilePath)
			if (!logFile) {
				return
			}
			
			const stat = await this.app.vault.adapter.stat(this.logFilePath)
			if (!stat || stat.size < 10 * 1024 * 1024) {
				return
			}
			
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
			const rotatedPath = `.lonely-assistant/logs/tools-${timestamp}.log`
			await this.app.vault.rename(logFile, rotatedPath)
			
			await this.cleanupOldRotatedLogs()
		} catch (error) {
			console.error('Failed to rotate logs:', error)
		}
	}
	
	private async cleanupOldRotatedLogs(): Promise<void> {
		try {
			const logsDir = this.app.vault.getAbstractFileByPath('.lonely-assistant/logs')
			if (!logsDir) {
				return
			}
			
			const files = await this.app.vault.adapter.list('.lonely-assistant/logs')
			const rotatedLogs = files.files.filter(f => f.includes('tools-') && f.endsWith('.log'))
			
			if (rotatedLogs.length > 5) {
				rotatedLogs.sort()
				const toDelete = rotatedLogs.slice(0, rotatedLogs.length - 5)
				
				for (const file of toDelete) {
					const fileObj = this.app.vault.getAbstractFileByPath(file)
					if (fileObj) {
						await this.app.vault.delete(fileObj)
					}
				}
			}
		} catch (error) {
			console.error('Failed to cleanup old logs:', error)
		}
	}
}
