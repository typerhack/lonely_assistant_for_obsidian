import { Tool, ToolParameter, ToolResult } from './types'
import { requestUrl } from 'obsidian'

interface WebSearchResult {
	title: string
	url: string
	snippet: string
	relevance?: number
}

interface WebSearchResponse {
	results: WebSearchResult[]
	cached: boolean
	searchTime: number
}

export class WebSearchTool implements Tool {
	name = 'web_search'
	description = 'Query external knowledge using Ollama web search API'
	riskLevel = 'medium' as const
	canBypass = true
	requiresPreview = false
	sensitiveFields = ['api_key']
	
	parameters: ToolParameter[] = [
		{
			name: 'query',
			type: 'string',
			description: 'Search query',
			required: true
		},
		{
			name: 'maxResults',
			type: 'number',
			description: 'Maximum number of search results',
			required: false,
			default: 5
		},
		{
			name: 'freshness',
			type: 'string',
			description: 'Time range filter: day, week, month, year',
			required: false
		}
	]
	
	private cache = new Map<string, { data: WebSearchResponse; timestamp: number }>()
	private cacheTTL = 3600000
	
	constructor(
		private endpoint: string,
		private apiKey: string | undefined,
		private maxResults: number = 5,
		private cacheEnabled: boolean = true
	) {}
	
	async execute(params: Record<string, unknown>): Promise<ToolResult> {
		try {
			const query = params.query as string
			const maxResults = (params.maxResults as number) ?? this.maxResults
			const freshness = params.freshness as string | undefined
			
			if (!query) {
				return {
					success: false,
					error: 'Query parameter is required'
				}
			}
			
			const cacheKey = this.getCacheKey(query, maxResults, freshness)
			
			if (this.cacheEnabled) {
				const cached = this.getFromCache(cacheKey)
				if (cached) {
					return {
						success: true,
						data: cached.results,
						metadata: {
							cached: true,
							searchTime: cached.searchTime
						}
					}
				}
			}
			
			const startTime = Date.now()
			
			const searchResults = await this.performSearch(query, maxResults, freshness)
			
			const searchTime = Date.now() - startTime
			
			const response: WebSearchResponse = {
				results: searchResults,
				cached: false,
				searchTime
			}
			
			if (this.cacheEnabled) {
				this.setCache(cacheKey, response)
			}
			
			return {
				success: true,
				data: searchResults,
				metadata: {
					cached: false,
					searchTime
				}
			}
		} catch (error) {
			return {
				success: false,
				error: `Web search tool execution failed: ${error.message}`
			}
		}
	}
	
	private async performSearch(query: string, maxResults: number, freshness?: string): Promise<WebSearchResult[]> {
		const headers: Record<string, string> = { 'Content-Type': 'application/json' }
		if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`

		const body: any = {
			model: 'llama3.2',
			messages: [{ role: 'user', content: query }],
			stream: false,
			tools: [ { type: 'web_search' } ],
		}
		// Pass simple options if supported by server
		;(body as any).web_search = { max_results: maxResults }
		if (freshness) (body as any).web_search.freshness = freshness

		const response = await requestUrl({
			url: `${this.endpoint}/api/chat`,
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			throw: false
		})

		if (response.status !== 200) {
			throw new Error(`Ollama API returned status ${response.status}: ${response.text}`)
		}

		const data = typeof response.json === 'string' ? JSON.parse(response.json) : response.json
		return this.parseSearchResponse(data, maxResults)
	}
	
	private parseSearchResponse(responseData: any, maxResults: number): WebSearchResult[] {
		const results: WebSearchResult[] = []
		
		if (responseData?.message?.tool_calls) {
			for (const toolCall of responseData.message.tool_calls) {
				if (toolCall.function?.name === 'web_search' && toolCall.function?.arguments) {
					const searchResults = toolCall.function.arguments.results || []
					for (const result of searchResults.slice(0, maxResults)) {
						results.push({
							title: result.title || 'Untitled',
							url: result.url || '',
							snippet: result.snippet || result.description || '',
							relevance: result.score
						})
					}
				}
			}
		}
		// Some servers may return results directly under responseData.results
		if (!results.length && Array.isArray(responseData?.results)) {
			for (const r of responseData.results.slice(0, maxResults)) {
				results.push({ title: r.title || 'Untitled', url: r.url || '', snippet: r.snippet || r.description || '', relevance: r.score })
			}
		}
		
		return results.slice(0, maxResults)
	}
	
	private getCacheKey(query: string, maxResults: number, freshness?: string): string {
		return `${query}|${maxResults}|${freshness || 'none'}`
	}
	
	private getFromCache(key: string): WebSearchResponse | null {
		const cached = this.cache.get(key)
		if (!cached) {
			return null
		}
		
		if (Date.now() - cached.timestamp > this.cacheTTL) {
			this.cache.delete(key)
			return null
		}
		
		return cached.data
	}
	
	private setCache(key: string, data: WebSearchResponse): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now()
		})
	}
	
	clearCache(): void {
		this.cache.clear()
	}
}
