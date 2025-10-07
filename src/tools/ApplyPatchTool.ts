import { Tool, ToolParameter, ToolResult } from './types'
import { Vault, normalizePath } from 'obsidian'
import { createHash } from 'crypto'

interface PatchOperation {
	startLine: number
	endLine: number
	newContent: string
}

interface PatchResult {
	modified: boolean
	diff: string
	backupPath: string
	checksumBefore: string
	checksumAfter: string
}

export class ApplyPatchTool implements Tool {
	name = 'apply_patch'
	description = 'Propose and apply file edits with diff preview and undo support'
	riskLevel = 'high' as const
	canBypass = false
	requiresPreview = true
	
	parameters: ToolParameter[] = [
		{
			name: 'path',
			type: 'string',
			description: 'File path to modify',
			required: true
		},
		{
			name: 'patches',
			type: 'array',
			description: 'Array of edit operations',
			required: true
		}
	]
	
	private backupDir = '.lonely-assistant/backups'
	private undoStack = new Map<string, string>()
	
	constructor(private vault: Vault, private backupEnabled: boolean = true) {}
	
	async preview(params: Record<string, unknown>): Promise<string> {
		try {
			const path = params.path as string
			const patches = params.patches as PatchOperation[]
			
			if (!path || !patches) {
				return 'Error: Missing required parameters'
			}
			
			const file = this.vault.getAbstractFileByPath(path)
			if (!file) {
				return `Error: File not found: ${path}`
			}
			
			const tfile = file as any
			const content = await this.vault.read(tfile)
			const newContent = this.applyPatches(content, patches)
			
			return this.generateDiff(path, content, newContent)
		} catch (error) {
			return `Error generating preview: ${error.message}`
		}
	}
	
	async execute(params: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = params.path as string
			const patches = params.patches as PatchOperation[]
			
			if (!path) {
				return {
					success: false,
					error: 'Path parameter is required'
				}
			}
			
			if (!patches || !Array.isArray(patches) || patches.length === 0) {
				return {
					success: false,
					error: 'Patches parameter is required and must be a non-empty array'
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
			const originalContent = await this.vault.read(tfile)
			const checksumBefore = this.checksum(originalContent)
			
			const executionId = `patch-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
			
			let backupPath = ''
			if (this.backupEnabled) {
				backupPath = await this.createBackup(path, originalContent, executionId)
			}
			
			const newContent = this.applyPatches(originalContent, patches)
			const checksumAfter = this.checksum(newContent)
			
			await this.vault.modify(tfile, newContent)
			
			this.undoStack.set(executionId, originalContent)
			
			const diff = this.generateDiff(path, originalContent, newContent)
			
			const result: PatchResult = {
				modified: true,
				diff,
				backupPath,
				checksumBefore,
				checksumAfter
			}
			
			return {
				success: true,
				executionId,
				data: result,
				metadata: {
					linesChanged: patches.length,
					backupEnabled: this.backupEnabled
				}
			}
		} catch (error) {
			return {
				success: false,
				error: `Apply patch tool execution failed: ${error.message}`
			}
		}
	}
	
	async undo(executionId: string): Promise<void> {
		const originalContent = this.undoStack.get(executionId)
		if (!originalContent) {
			throw new Error(`No undo information found for execution ID: ${executionId}`)
		}
		
		this.undoStack.delete(executionId)
	}
	
	private applyPatches(content: string, patches: PatchOperation[]): string {
		const lines = content.split('\n')
		
		const sortedPatches = [...patches].sort((a, b) => b.startLine - a.startLine)
		
		for (const patch of sortedPatches) {
			const startIdx = Math.max(0, patch.startLine - 1)
			const endIdx = Math.min(lines.length, patch.endLine)
			
			const newLines = patch.newContent.split('\n')
			lines.splice(startIdx, endIdx - startIdx, ...newLines)
		}
		
		return lines.join('\n')
	}
	
	private generateDiff(filePath: string, oldContent: string, newContent: string): string {
		const oldLines = oldContent.split('\n')
		const newLines = newContent.split('\n')
		
		const diff: string[] = []
		diff.push(`--- ${filePath}`)
		diff.push(`+++ ${filePath}`)
		
		let i = 0
		let j = 0
		
		while (i < oldLines.length || j < newLines.length) {
			if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
				diff.push(` ${oldLines[i]}`)
				i++
				j++
			} else {
				if (i < oldLines.length) {
					diff.push(`-${oldLines[i]}`)
					i++
				}
				if (j < newLines.length) {
					diff.push(`+${newLines[j]}`)
					j++
				}
			}
		}
		
		return diff.join('\n')
	}
	
	private async createBackup(path: string, content: string, executionId: string): Promise<string> {
		const adapter = this.vault.adapter
		const parentDir = '.lonely-assistant'
		const backupDirPath = normalizePath(this.backupDir)
		
		// Ensure parent directory exists
		if (!(await adapter.exists(parentDir))) {
			await adapter.mkdir(parentDir)
		}
		
		// Ensure backup directory exists
		if (!(await adapter.exists(backupDirPath))) {
			await adapter.mkdir(backupDirPath)
		}
		
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
		const fileName = path.split('/').pop() || 'unknown'
		const backupFileName = `${executionId}-${timestamp}-${fileName}`
		const backupPath = normalizePath(`${backupDirPath}/${backupFileName}`)
		
		await adapter.write(backupPath, content)
		
		return backupPath
	}
	
	private checksum(content: string): string {
		return createHash('sha256').update(content).digest('hex')
	}
}
