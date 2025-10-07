import { ToolSettings } from './types'

interface RateLimitEntry {
	timestamps: number[]
}

export class RateLimiter {
	private limits: Map<string, RateLimitEntry> = new Map()
	private globalTimestamps: number[] = []
	
	constructor(private settings: ToolSettings) {}
	
	async checkLimit(toolName: string): Promise<boolean> {
		const now = Date.now()
		const windowMs = 60 * 1000
		
		const toolLimit = this.settings.rateLimits[toolName] || 60
		const globalLimit = this.settings.globalRateLimit
		
		this.cleanupOldTimestamps(now, windowMs)
		
		const toolEntry = this.limits.get(toolName)
		if (toolEntry) {
			if (toolEntry.timestamps.length >= toolLimit) {
				return false
			}
		}
		
		if (this.globalTimestamps.length >= globalLimit) {
			return false
		}
		
		if (!toolEntry) {
			this.limits.set(toolName, { timestamps: [now] })
		} else {
			toolEntry.timestamps.push(now)
		}
		
		this.globalTimestamps.push(now)
		
		return true
	}
	
	private cleanupOldTimestamps(now: number, windowMs: number): void {
		const cutoff = now - windowMs
		
		for (const entry of this.limits.values()) {
			entry.timestamps = entry.timestamps.filter(ts => ts > cutoff)
		}
		
		this.globalTimestamps = this.globalTimestamps.filter(ts => ts > cutoff)
	}
	
	updateSettings(settings: ToolSettings): void {
		this.settings = settings
	}
	
	reset(): void {
		this.limits.clear()
		this.globalTimestamps = []
	}
}
