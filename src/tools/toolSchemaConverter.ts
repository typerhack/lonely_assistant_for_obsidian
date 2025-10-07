import { Tool } from './types'
import { OllamaTool } from '../OllamaClient'

export function convertToolToOllamaSchema(tool: Tool): OllamaTool {
	const properties: Record<string, { type: string; description: string }> = {}
	const required: string[] = []

	for (const param of tool.parameters) {
		properties[param.name] = {
			type: param.type,
			description: param.description,
		}

		if (param.required) {
			required.push(param.name)
		}
	}

	return {
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: {
				type: 'object',
				properties,
				required,
			},
		},
	}
}

export function convertToolsToOllamaSchemas(tools: Tool[]): OllamaTool[] {
	return tools.map(convertToolToOllamaSchema)
}
