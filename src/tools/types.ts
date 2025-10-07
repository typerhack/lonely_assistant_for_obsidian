export type RiskLevel = 'safe' | 'low' | 'medium' | 'high'
export type ConsentMode = 'always_ask' | 'session_allow' | 'always_allow' | 'never_allow'

export interface ToolParameter {
	name: string
	type: 'string' | 'number' | 'boolean' | 'array' | 'object'
	description: string
	required: boolean
	default?: unknown
}

export interface ToolResult {
	success: boolean
	data?: unknown
	error?: string
	executionId?: string
	metadata?: Record<string, unknown>
}

export interface Tool {
	name: string
	description: string
	parameters: ToolParameter[]
	riskLevel: RiskLevel
	canBypass: boolean
	requiresPreview: boolean
	sensitiveFields?: string[]
	
	execute(params: Record<string, unknown>): Promise<ToolResult>
	preview?(params: Record<string, unknown>): Promise<string>
	undo?(executionId: string): Promise<void>
}

export interface ToolProvider {
	id: string
	name: string
	description: string
	version: string
	tools: Tool[]
	
	initialize(): Promise<void>
	shutdown(): Promise<void>
}

export interface ConsentRequest {
	tool: Tool
	parameters: Record<string, unknown>
	preview?: string
	riskLevel: RiskLevel
	canBypass: boolean
}

export interface ConsentResponse {
	approved: boolean
	mode: 'once' | 'session' | 'always' | 'never'
}

export interface ToolExecutionLog {
	timestamp: string
	tool: string
	executionId: string
	parameters: Record<string, unknown>
	result: ToolResult
	duration: number
	userId?: string
}

export interface ToolSettings {
	enabledTools: string[]
	consentMode: Record<string, ConsentMode>
	developerMode: boolean
	printLogs: boolean
	rateLimits: Record<string, number>
	globalRateLimit: number
	cacheEnabled: boolean
	cacheTTL: number
	maxCacheSize: number
	ollamaApiKey?: string
	ollamaWebSearchEndpoint: string
	encryptedKeys?: {
		ollama?: string
	}
	allowedDomains: string[]
	allowAllDomains: boolean
	blockExternalRequests: boolean
	httpsOnly: boolean
	maxResponseSize: number
	enableAuditLog: boolean
	auditLogRetentionDays: number
	logParameterValues: boolean
	anonymizeLog: boolean
	shareUsageStatistics: boolean
	findMaxResults: number
	grepContextLines: number
	readMaxBytes: number
	patchBackupEnabled: boolean
	webSearchMaxResults: number
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
	enabledTools: ['find', 'grep', 'read'],
	consentMode: {
		find: 'session_allow',
		grep: 'session_allow',
		read: 'session_allow',
		apply_patch: 'always_ask',
		web_search: 'always_ask',
		web_fetch: 'always_ask'
	},
	developerMode: false,
	printLogs: false,
	rateLimits: {
		find: 100,
		grep: 60,
		read: 100,
		apply_patch: 10,
		web_search: 10,
		web_fetch: 20
	},
	globalRateLimit: 200,
	cacheEnabled: true,
	cacheTTL: 3600,
	maxCacheSize: 104857600,
	ollamaWebSearchEndpoint: 'http://localhost:11434',
	allowedDomains: ['localhost', '127.0.0.1'],
	allowAllDomains: false,
	blockExternalRequests: false,
	httpsOnly: true,
	maxResponseSize: 10485760,
	enableAuditLog: true,
	auditLogRetentionDays: 30,
	logParameterValues: true,
	anonymizeLog: false,
	shareUsageStatistics: false,
	findMaxResults: 50,
	grepContextLines: 2,
	readMaxBytes: 1048576,
	patchBackupEnabled: true,
	webSearchMaxResults: 5
}
