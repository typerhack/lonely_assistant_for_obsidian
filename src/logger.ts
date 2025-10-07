export class Logger {
	private static _enabled = false

	static setEnabled(enabled: boolean) {
		Logger._enabled = !!enabled
	}

	static get enabled() {
		return Logger._enabled
	}

	static log(...args: unknown[]) {
		if (!Logger._enabled) return
		console.log('[LonelyAssistant]', ...args)
	}

	static info(...args: unknown[]) {
		if (!Logger._enabled) return
		console.info('[LonelyAssistant]', ...args)
	}

	static warn(...args: unknown[]) {
		if (!Logger._enabled) return
		console.warn('[LonelyAssistant]', ...args)
	}

	static error(...args: unknown[]) {
		if (!Logger._enabled) return
		console.error('[LonelyAssistant]', ...args)
	}
}

