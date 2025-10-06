export interface LonelyAssistantSettings {
	ollamaHost: string
	model: string
	temperature: number
	maxTokens: number
	defaultPrompt: string
}

export const DEFAULT_SETTINGS: LonelyAssistantSettings = {
	ollamaHost: 'http://localhost:11434',
	model: 'llama2',
	temperature: 0.7,
	maxTokens: 2048,
	defaultPrompt: 'You are a helpful AI assistant. Answer the user\'s question based on the provided context.'
}

export function mergeSettings(loaded: unknown): LonelyAssistantSettings {
	if (!loaded || typeof loaded !== 'object') {
		return { ...DEFAULT_SETTINGS }
	}

	const partial = loaded as Partial<LonelyAssistantSettings>

	return {
		...DEFAULT_SETTINGS,
		...partial,
	}
}
