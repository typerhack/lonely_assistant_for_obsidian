import { ToolProvider, Tool, ToolSettings } from './types'
import { FindTool } from './FindTool'
import { GrepTool } from './GrepTool'
import { ReadTool } from './ReadTool'
import { ApplyPatchTool } from './ApplyPatchTool'
import { WebSearchTool } from './WebSearchTool'
import { WebFetchTool } from './WebFetchTool'
import { App } from 'obsidian'

export class BuiltInToolProvider implements ToolProvider {
	id = 'builtin'
	name = 'Built-in Tools'
	description = 'Standard file system and network tools for Lonely Assistant'
	version = '1.0.0'
	tools: Tool[] = []

	private findTool: FindTool
	private grepTool: GrepTool
	private readTool: ReadTool
	private applyPatchTool: ApplyPatchTool
	private webSearchTool: WebSearchTool
	private webFetchTool: WebFetchTool

	constructor(private app: App, private settings: ToolSettings) {
		this.findTool = new FindTool(app.vault, settings.findMaxResults)
		this.grepTool = new GrepTool(app.vault, settings.grepContextLines)
		this.readTool = new ReadTool(app.vault, settings.readMaxBytes)
		this.applyPatchTool = new ApplyPatchTool(app.vault, settings.patchBackupEnabled)
		this.webSearchTool = new WebSearchTool(settings.ollamaWebSearchEndpoint, settings.ollamaApiKey, settings.webSearchMaxResults, settings.cacheEnabled)
		this.webFetchTool = new WebFetchTool(settings.maxResponseSize, settings.cacheEnabled, settings.allowedDomains, settings.allowAllDomains, settings.httpsOnly)

		this.tools = [
			this.findTool,
			this.grepTool,
			this.readTool,
			this.applyPatchTool,
			this.webSearchTool,
			this.webFetchTool
		]
	}

	async initialize(): Promise<void> {
	}

	async shutdown(): Promise<void> {
	}

	getToolByName(name: string): Tool | undefined {
		return this.tools.find(tool => tool.name === name)
	}
}
