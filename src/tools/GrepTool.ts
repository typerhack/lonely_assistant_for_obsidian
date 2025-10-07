import { Tool, ToolParameter, ToolResult } from './types'
import { Vault } from 'obsidian'

interface GrepMatch {
	file: string
	line: number
	match: string
	context: string
}

export class GrepTool implements Tool {
	name = 'grep'
	description = 'Search file contents using regex patterns with surrounding context'
	riskLevel = 'low' as const
	canBypass = true
	requiresPreview = false
	
	parameters: ToolParameter[] = [
		{
			name: 'pattern',
			type: 'string',
			description: 'Regex pattern to search for',
			required: true
		},
		{
			name: 'filePattern',
			type: 'string',
			description: 'Glob pattern to limit search to specific files',
			required: false
		},
		{
			name: 'fileList',
			type: 'array',
			description: 'Explicit list of file paths to search (overrides filePattern)',
			required: false
		},
		{
			name: 'contextLines',
			type: 'number',
			description: 'Number of lines of context around each match',
			required: false,
			default: 2
		},
		{
			name: 'maxMatches',
			type: 'number',
			description: 'Maximum number of matches to return',
			required: false,
			default: 100
		}
	]
	
	constructor(
		private vault: Vault,
		private contextLines: number = 2,
		private maxMatches: number = 100
	) {}
	
	async execute(params: Record<string, unknown>): Promise<ToolResult> {
		try {
			const pattern = params.pattern as string
			const filePattern = params.filePattern as string | undefined
			const contextLines = (params.contextLines as number) ?? this.contextLines
			const maxMatches = (params.maxMatches as number) ?? this.maxMatches
			
			if (!pattern) {
				return {
					success: false,
					error: 'Pattern parameter is required'
				}
			}
			
			let regex: RegExp
			try {
				regex = new RegExp(pattern, 'gm')
			} catch (error) {
				return {
					success: false,
					error: `Invalid regex pattern: ${error.message}`
				}
			}
			
			let files = this.vault.getMarkdownFiles()
			const fileList = Array.isArray((params as any).fileList) ? (params as any).fileList as string[] : undefined

			if (fileList && fileList.length) {
				const allowed = new Set(fileList)
				files = files.filter(file => allowed.has(file.path))
			} else if (filePattern) {
				const fileRegex = this.globToRegex(filePattern)
				files = files.filter(file => fileRegex.test(file.path))
			}
			
			const matches: GrepMatch[] = []
			let totalMatches = 0
			
			for (const file of files) {
				if (matches.length >= maxMatches) {
					break
				}
				
				try {
					const content = await this.vault.read(file)
					const fileMatches = await this.searchInContent(
						content,
						regex,
						file.path,
						contextLines,
						maxMatches - matches.length
					)
					
					matches.push(...fileMatches)
					totalMatches += fileMatches.length
				} catch (error) {
					continue
				}
			}
			
			return {
				success: true,
				data: matches,
				metadata: {
					totalMatches,
					returned: matches.length,
					truncated: totalMatches > maxMatches,
					filesSearched: files.length
				}
			}
		} catch (error) {
			return {
				success: false,
				error: `Grep tool execution failed: ${error.message}`
			}
		}
	}
	
	private async searchInContent(
		content: string,
		regex: RegExp,
		filePath: string,
		contextLines: number,
		maxMatches: number
	): Promise<GrepMatch[]> {
		const matches: GrepMatch[] = []
		const lines = content.split('\n')
		
		for (let i = 0; i < lines.length; i++) {
			if (matches.length >= maxMatches) {
				break
			}
			
			const line = lines[i]
			const match = line.match(regex)
			
			if (match) {
				const startLine = Math.max(0, i - contextLines)
				const endLine = Math.min(lines.length - 1, i + contextLines)
				
				const contextBefore = lines.slice(startLine, i)
				const contextAfter = lines.slice(i + 1, endLine + 1)
				
				const context = [
					...contextBefore,
					line,
					...contextAfter
				].join('\n')
				
				matches.push({
					file: filePath,
					line: i + 1,
					match: line,
					context
				})
			}
		}
		
		return matches
	}
	
	private globToRegex(pattern: string): RegExp {
		let regexStr = pattern
			.replace(/\./g, '\\.')
			.replace(/\*\*/g, '<<<DOUBLESTAR>>>')
			.replace(/\*/g, '[^/]*')
			.replace(/<<<DOUBLESTAR>>>/g, '.*')
			.replace(/\?/g, '[^/]')
		
		return new RegExp(`^${regexStr}$`)
	}
}
