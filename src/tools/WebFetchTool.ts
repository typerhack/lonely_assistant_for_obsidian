import { Tool, ToolParameter, ToolResult } from './types'
import { requestUrl } from 'obsidian'

interface WebFetchResult {
	content: string
	url: string
	title: string
	contentType: string
	size: number
}

interface WebFetchResponse {
	result: WebFetchResult
	cached: boolean
	fetchTime: number
}

export class WebFetchTool implements Tool {
	name = 'web_fetch'
	description = 'Retrieve and parse web page content for AI analysis'
	riskLevel = 'medium' as const
	canBypass = true
	requiresPreview = false
	
	parameters: ToolParameter[] = [
		{
			name: 'url',
			type: 'string',
			description: 'URL to fetch',
			required: true
		},
		{
			name: 'format',
			type: 'string',
			description: 'Output format: markdown, text, or html',
			required: false,
			default: 'markdown'
		},
		{
			name: 'maxBytes',
			type: 'number',
			description: 'Maximum content size in bytes',
			required: false,
			default: 512000
		}
	]
	
	private cache = new Map<string, { data: WebFetchResponse; timestamp: number }>()
	private cacheTTL = 3600000
	
	constructor(
		private maxBytes: number = 512000,
		private cacheEnabled: boolean = true,
		private allowedDomains: string[] = [],
		private allowAllDomains: boolean = false,
		private httpsOnly: boolean = true
	) {}
	
	async execute(params: Record<string, unknown>): Promise<ToolResult> {
		try {
			const url = params.url as string
			const format = (params.format as string) ?? 'markdown'
			const maxBytes = (params.maxBytes as number) ?? this.maxBytes
			
			if (!url) {
				return {
					success: false,
					error: 'URL parameter is required'
				}
			}
			
			if (!this.isValidUrl(url)) {
				return {
					success: false,
					error: 'Invalid URL format'
				}
			}
			
			if (!this.isAllowedDomain(url)) {
				return {
					success: false,
					error: 'Domain not allowed. Configure allowed domains in settings.'
				}
			}
			
			if (this.httpsOnly && !url.startsWith('https://')) {
				return {
					success: false,
					error: 'Only HTTPS URLs are allowed. Disable HTTPS-only mode in settings to fetch HTTP URLs.'
				}
			}
			
			const cacheKey = this.getCacheKey(url, format)
			
			if (this.cacheEnabled) {
				const cached = this.getFromCache(cacheKey)
				if (cached) {
					return {
						success: true,
						data: cached.result,
						metadata: {
							cached: true,
							fetchTime: cached.fetchTime
						}
					}
				}
			}
			
			const startTime = Date.now()
			
			const fetchResult = await this.fetchUrl(url, format, maxBytes)
			
			const fetchTime = Date.now() - startTime
			
			const response: WebFetchResponse = {
				result: fetchResult,
				cached: false,
				fetchTime
			}
			
			if (this.cacheEnabled) {
				this.setCache(cacheKey, response)
			}
			
			return {
				success: true,
				data: fetchResult,
				metadata: {
					cached: false,
					fetchTime
				}
			}
		} catch (error) {
			return {
				success: false,
				error: `Web fetch tool execution failed: ${error.message}`
			}
		}
	}
	
	private async fetchUrl(url: string, format: string, maxBytes: number): Promise<WebFetchResult> {
		const response = await requestUrl({
			url,
			method: 'GET',
			throw: false
		})
		
		if (response.status !== 200) {
			throw new Error(`HTTP ${response.status}: ${response.text}`)
		}
		
		let content = response.text
		const contentType = response.headers['content-type'] || 'text/html'
		
		if (content.length > maxBytes) {
			content = content.substring(0, maxBytes)
		}
		
		if (format === 'markdown' && contentType.includes('text/html')) {
			content = this.htmlToMarkdown(content)
		} else if (format === 'text') {
			content = this.htmlToText(content)
		}
		
		const title = this.extractTitle(response.text)
		
		return {
			content,
			url,
			title,
			contentType,
			size: content.length
		}
	}
	
	private isValidUrl(url: string): boolean {
		try {
			new URL(url)
			return true
		} catch {
			return false
		}
	}
	
	private isAllowedDomain(url: string): boolean {
		if (this.allowAllDomains) {
			return true
		}
		
		try {
			const urlObj = new URL(url)
			const hostname = urlObj.hostname
			
			for (const allowed of this.allowedDomains) {
				if (allowed.startsWith('*.')) {
					const domain = allowed.substring(2)
					if (hostname.endsWith(domain)) {
						return true
					}
				} else if (hostname === allowed) {
					return true
				}
			}
			
			return false
		} catch {
			return false
		}
	}
	
	private htmlToMarkdown(html: string): string {
		let markdown = html
		
		markdown = markdown.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
		markdown = markdown.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
		
		markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
		markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
		markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
		markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
		markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n')
		markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n')
		
		markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
		
		markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
		markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
		markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
		markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
		
		markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
		markdown = markdown.replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```')
		
		markdown = markdown.replace(/<br\s*\/?>/gi, '\n')
		markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
		
		markdown = markdown.replace(/<[^>]+>/g, '')
		
		markdown = markdown.replace(/&nbsp;/g, ' ')
		markdown = markdown.replace(/&lt;/g, '<')
		markdown = markdown.replace(/&gt;/g, '>')
		markdown = markdown.replace(/&amp;/g, '&')
		markdown = markdown.replace(/&quot;/g, '"')
		markdown = markdown.replace(/&#39;/g, "'")
		
		markdown = markdown.replace(/\n{3,}/g, '\n\n')
		
		return markdown.trim()
	}
	
	private htmlToText(html: string): string {
		let text = html
		
		text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
		text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
		
		text = text.replace(/<br\s*\/?>/gi, '\n')
		text = text.replace(/<\/p>/gi, '\n\n')
		
		text = text.replace(/<[^>]+>/g, '')
		
		text = text.replace(/&nbsp;/g, ' ')
		text = text.replace(/&lt;/g, '<')
		text = text.replace(/&gt;/g, '>')
		text = text.replace(/&amp;/g, '&')
		text = text.replace(/&quot;/g, '"')
		text = text.replace(/&#39;/g, "'")
		
		text = text.replace(/\n{3,}/g, '\n\n')
		
		return text.trim()
	}
	
	private extractTitle(html: string): string {
		const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
		if (titleMatch && titleMatch[1]) {
			return titleMatch[1].trim()
		}
		return 'Untitled'
	}
	
	private getCacheKey(url: string, format: string): string {
		return `${url}|${format}`
	}
	
	private getFromCache(key: string): WebFetchResponse | null {
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
	
	private setCache(key: string, data: WebFetchResponse): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now()
		})
	}
	
	clearCache(): void {
		this.cache.clear()
	}
}
