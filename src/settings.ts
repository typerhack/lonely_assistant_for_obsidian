export interface LonelyAssistantSettings {
	ollamaHost: string
	model: string
	temperature: number
	maxTokens: number
	defaultPrompt: string
	ragEnabled: boolean
	ragMaxContext: number
	ragExcludeFolders: string[]
}

export const DEFAULT_SETTINGS: LonelyAssistantSettings = {
	ollamaHost: 'http://localhost:11434',
	model: 'llama2',
	temperature: 0.7,
	maxTokens: 2048,
	defaultPrompt: 'You are a helpful AI assistant. Answer the user\'s question based on the provided context.',
	ragEnabled: true,
	ragMaxContext: 4,
	ragExcludeFolders: [],
}

export function mergeSettings(loaded: unknown): LonelyAssistantSettings {
	if (!loaded || typeof loaded !== 'object') {
		return { ...DEFAULT_SETTINGS }
	}

	const partial = loaded as Partial<LonelyAssistantSettings & { ragExcludeFolders?: string | string[] }>
	const rawExclude = (partial as { ragExcludeFolders?: unknown }).ragExcludeFolders
	let exclude = DEFAULT_SETTINGS.ragExcludeFolders
	if (Array.isArray(rawExclude)) {
		exclude = rawExclude.map((value) => String(value).trim()).filter(Boolean)
	} else if (typeof rawExclude === 'string') {
		exclude = rawExclude
			.split(',')
			.map((value: string) => value.trim())
			.filter(Boolean)
	}

	return {
		...DEFAULT_SETTINGS,
		...partial,
		ragExcludeFolders: exclude,
	}
}
