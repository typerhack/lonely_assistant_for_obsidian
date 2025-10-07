export interface OllamaToolCall {
	function: {
		name: string
		arguments: Record<string, unknown>
	}
}

export interface OllamaMessage {
	role: 'user' | 'assistant' | 'system' | 'tool'
	content: string
	tool_calls?: OllamaToolCall[]
}

export interface OllamaTool {
	type: 'function'
	function: {
		name: string
		description: string
		parameters: {
			type: 'object'
			properties: Record<string, {
				type: string
				description: string
			}>
			required: string[]
		}
	}
}

export interface OllamaResponse {
	model: string
	created_at: string
	message: OllamaMessage
	done: boolean
	done_reason?: string
	total_duration?: number
	load_duration?: number
	prompt_eval_count?: number
	eval_count?: number
	eval_duration?: number
}

export class OllamaClient {
	private baseUrl: string

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl.replace(/\/$/, '')
	}

	async *chat(
		messages: OllamaMessage[],
		model: string,
		options: {
			temperature?: number
			maxTokens?: number
			stream?: boolean
			tools?: OllamaTool[]
		} = {},
		signal?: AbortSignal
	): AsyncGenerator<string, void, unknown> {
		const requestBody = {
			model,
			messages,
			stream: options.stream !== false,
			options: {
				temperature: options.temperature,
				num_predict: options.maxTokens,
			},
			tools: options.tools,
		}

		try {
			const response = await fetch(`${this.baseUrl}/api/chat`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
				signal,
			})

			if (!response.ok) {
				throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
			}

			if (!response.body) {
				throw new Error('No response body from Ollama')
			}

			const reader = response.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ''
			let aborted = false

			if (signal) {
				if (signal.aborted) {
					await reader.cancel().catch(() => undefined)
					throw new DOMException('Aborted', 'AbortError')
				}

				signal.addEventListener('abort', () => {
					aborted = true
					void reader.cancel().catch(() => undefined)
				}, { once: true })
			}

			try {
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					buffer += decoder.decode(value, { stream: true })
					const lines = buffer.split('\n')
					buffer = lines.pop() || ''

					for (const line of lines) {
						if (!line.trim()) {
							continue
						}

						try {
							const data: OllamaResponse = JSON.parse(line)
							if (data.message?.content) {
								yield data.message.content
							}
							if (data.done) {
								return
							}
						} catch (parseError) {
							console.error('Failed to parse Ollama response:', parseError)
						}
					}
				}
			} catch (readError) {
				if (aborted || (readError instanceof DOMException && readError.name === 'AbortError')) {
					throw new DOMException('Aborted', 'AbortError')
				}
				throw readError
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw error
			}

			const message = error instanceof Error ? error.message : String(error)
			throw new Error(`Failed to communicate with Ollama: ${message}`)
		}
	}

	async *chatWithTools(
		messages: OllamaMessage[],
		model: string,
		options: {
			temperature?: number
			maxTokens?: number
			stream?: boolean
			tools?: OllamaTool[]
		} = {},
		signal?: AbortSignal
	): AsyncGenerator<{ type: 'content' | 'message'; content?: string; message?: OllamaMessage }, void, unknown> {
		const requestBody = {
			model,
			messages,
			stream: options.stream !== false,
			options: {
				temperature: options.temperature,
				num_predict: options.maxTokens,
			},
			tools: options.tools,
		}

		try {
			const response = await fetch(`${this.baseUrl}/api/chat`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
				signal,
			})

			if (!response.ok) {
				throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
			}

			if (!response.body) {
				throw new Error('No response body from Ollama')
			}

			const reader = response.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ''
			let aborted = false

			if (signal) {
				if (signal.aborted) {
					await reader.cancel().catch(() => undefined)
					throw new DOMException('Aborted', 'AbortError')
				}

				signal.addEventListener('abort', () => {
					aborted = true
					void reader.cancel().catch(() => undefined)
				}, { once: true })
			}

			try {
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					buffer += decoder.decode(value, { stream: true })
					const lines = buffer.split('\n')
					buffer = lines.pop() || ''

					for (const line of lines) {
						if (!line.trim()) {
							continue
						}

						try {
							const data: OllamaResponse = JSON.parse(line)
							if (data.message?.content) {
								yield { type: 'content', content: data.message.content }
							}
							if (data.done) {
								if (data.message) {
									yield { type: 'message', message: data.message }
								}
								return
							}
						} catch (parseError) {
							console.error('Failed to parse Ollama response:', parseError)
						}
					}
				}
			} catch (readError) {
				if (aborted || (readError instanceof DOMException && readError.name === 'AbortError')) {
					throw new DOMException('Aborted', 'AbortError')
				}
				throw readError
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw error
			}

			const message = error instanceof Error ? error.message : String(error)
			throw new Error(`Failed to communicate with Ollama: ${message}`)
		}
	}

	async chatOnce(
		messages: OllamaMessage[],
		model: string,
		options: {
			temperature?: number
			maxTokens?: number
			tools?: OllamaTool[]
		} = {},
		signal?: AbortSignal
	): Promise<OllamaMessage | null> {
		const requestBody = {
			model,
			messages,
			stream: false,
			options: {
				temperature: options.temperature,
				num_predict: options.maxTokens,
			},
			tools: options.tools,
		}

		const response = await fetch(`${this.baseUrl}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestBody),
			signal,
		})
		if (!response.ok) {
			throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
		}
		const data: OllamaResponse = await response.json()
		return data.message || null
	}

	async testConnection(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			})
			return response.ok
		} catch {
			return false
		}
	}

	async listModels(): Promise<string[]> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			})

			if (!response.ok) {
				throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`)
			}

			const data = await response.json()
			return data.models?.map((model: { name: string }) => model.name) || []
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			throw new Error(message)
		}
	}
}
