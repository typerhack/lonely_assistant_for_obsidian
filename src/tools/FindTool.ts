import { Tool, ToolParameter, ToolResult } from './types'
import { Vault, TFile } from 'obsidian'

export class FindTool implements Tool {
	name = 'find'
	description = 'Search for files in the vault by name or path pattern using glob patterns or fuzzy matching'
	riskLevel = 'safe' as const
	canBypass = true
	requiresPreview = false
	
	parameters: ToolParameter[] = [
		{
			name: 'pattern',
			type: 'string',
			description: 'Glob pattern (e.g., **/*.md) or fuzzy search query',
			required: true
		},
		{
			name: 'includeHidden',
			type: 'boolean',
			description: 'Include hidden files in results',
			required: false,
			default: false
		},
		{
			name: 'maxResults',
			type: 'number',
			description: 'Maximum number of results to return',
			required: false,
			default: 50
		}
	]
	
	constructor(private vault: Vault, private maxResults: number = 50) {}
	
	async execute(params: Record<string, any>): Promise<ToolResult> {
		try {
			const pattern = params.pattern as string
			const includeHidden = params.includeHidden ?? false
			const maxResults = params.maxResults ?? this.maxResults
			
			if (!pattern) {
				return {
					success: false,
					error: 'Pattern parameter is required'
				}
			}
			
			const files = this.vault.getFiles()
			let matches: TFile[] = []
			
			if (this.isGlobPattern(pattern)) {
				matches = this.globMatch(files, pattern, includeHidden)
			} else {
				matches = this.fuzzyMatch(files, pattern, includeHidden)
			}
			
			const limitedMatches = matches.slice(0, maxResults)
			
			const results = limitedMatches.map(file => ({
				path: file.path,
				modified: new Date(file.stat.mtime).toISOString(),
				created: new Date(file.stat.ctime).toISOString(),
				size: file.stat.size
			}))
			
			return {
				success: true,
				data: results,
				metadata: {
					totalMatches: matches.length,
					returned: results.length,
					truncated: matches.length > maxResults
				}
			}
		} catch (error) {
			return {
				success: false,
				error: `Find tool execution failed: ${error.message}`
			}
		}
	}
	
	private isGlobPattern(pattern: string): boolean {
		return pattern.includes('*') || pattern.includes('?') || pattern.includes('[')
	}
	
	private globMatch(files: TFile[], pattern: string, includeHidden: boolean): TFile[] {
		const regex = this.globToRegex(pattern)
		
		return files.filter(file => {
			if (!includeHidden && this.isHidden(file.path)) {
				return false
			}
			return regex.test(file.path)
		})
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
	
	private fuzzyMatch(files: TFile[], query: string, includeHidden: boolean): TFile[] {
		const queryLower = query.toLowerCase()
		
		const scored = files
			.filter(file => !(!includeHidden && this.isHidden(file.path)))
			.map(file => {
				const pathLower = file.path.toLowerCase()
				const nameLower = file.name.toLowerCase()
				
				let score = 0
				
				if (nameLower === queryLower) {
					score = 1000
				} else if (nameLower.startsWith(queryLower)) {
					score = 500
				} else if (nameLower.includes(queryLower)) {
					score = 250
				} else if (pathLower.includes(queryLower)) {
					score = 100
				} else {
					const fuzzyScore = this.fuzzyScore(queryLower, pathLower)
					if (fuzzyScore > 0) {
						score = fuzzyScore
					}
				}
				
				return { file, score }
			})
			.filter(item => item.score > 0)
			.sort((a, b) => b.score - a.score)
		
		return scored.map(item => item.file)
	}
	
	private fuzzyScore(query: string, text: string): number {
		let queryIndex = 0
		let score = 0
		let lastMatchIndex = -1
		
		for (let i = 0; i < text.length && queryIndex < query.length; i++) {
			if (text[i] === query[queryIndex]) {
				score++
				if (lastMatchIndex >= 0 && i === lastMatchIndex + 1) {
					score += 5
				}
				lastMatchIndex = i
				queryIndex++
			}
		}
		
		if (queryIndex === query.length) {
			return score
		}
		
		return 0
	}
	
	private isHidden(path: string): boolean {
		const parts = path.split('/')
		return parts.some(part => part.startsWith('.'))
	}
}
