import { Tool, ToolParameter, ToolResult } from './types'
import { Vault } from 'obsidian'

interface ReadResult {
	content: string
	path: string
	size: number
	modified: string
	created: string
}

export class ReadTool implements Tool {
	name = 'read'
	description = 'Retrieve full or partial file contents safely'
	riskLevel = 'low' as const
	canBypass = true
	requiresPreview = false
	
	parameters: ToolParameter[] = [
		{
			name: 'path',
			type: 'string',
			description: 'File path relative to vault root',
			required: true
		},
		{
			name: 'startLine',
			type: 'number',
			description: 'Start reading from this line (1-indexed)',
			required: false
		},
		{
			name: 'endLine',
			type: 'number',
			description: 'Stop reading at this line (1-indexed, inclusive)',
			required: false
		},
		{
			name: 'maxBytes',
			type: 'number',
			description: 'Maximum bytes to read',
			required: false,
			default: 1048576
		}
	]
	
	constructor(private vault: Vault, private maxBytes: number = 1048576) {}
	
	async execute(params: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = params.path as string
			const startLine = params.startLine as number | undefined
			const endLine = params.endLine as number | undefined
			const maxBytes = (params.maxBytes as number) ?? this.maxBytes
			
			if (!path) {
				return {
					success: false,
					error: 'Path parameter is required'
				}
			}
			
			const file = this.vault.getAbstractFileByPath(path)
			
			if (!file) {
				return {
					success: false,
					error: `File not found: ${path}`
				}
			}
			
			if (file.hasOwnProperty('children')) {
				return {
					success: false,
					error: `Path is a directory, not a file: ${path}`
				}
			}
			
			const tfile = file as any
			
			if (tfile.stat.size > maxBytes) {
				return {
					success: false,
					error: `File size (${tfile.stat.size} bytes) exceeds maximum allowed (${maxBytes} bytes)`
				}
			}
			
			let content = await this.vault.read(tfile)
			
			if (startLine !== undefined || endLine !== undefined) {
				const lines = content.split('\n')
				const start = startLine ? Math.max(0, startLine - 1) : 0
				const end = endLine ? Math.min(lines.length, endLine) : lines.length
				
				if (start >= lines.length) {
					return {
						success: false,
						error: `Start line ${startLine} exceeds file length (${lines.length} lines)`
					}
				}
				
				content = lines.slice(start, end).join('\n')
			}
			
			const result: ReadResult = {
				content,
				path: tfile.path,
				size: tfile.stat.size,
				modified: new Date(tfile.stat.mtime).toISOString(),
				created: new Date(tfile.stat.ctime).toISOString()
			}
			
			return {
				success: true,
				data: result,
				metadata: {
					lines: content.split('\n').length,
					bytes: new Blob([content]).size,
					partial: startLine !== undefined || endLine !== undefined
				}
			}
		} catch (error) {
			return {
				success: false,
				error: `Read tool execution failed: ${error.message}`
			}
		}
	}
}
