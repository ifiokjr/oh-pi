interface TimerApi {
	setTimeout(handler: () => void, delayMs: number): unknown;
	clearTimeout(handle: unknown): void;
}

interface FileCoalescer {
	schedule(file: string, delayMs?: number): boolean;
	clear(): void;
}

const defaultTimerApi: TimerApi = {
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
	setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
};

export function createFileCoalescer(
	handler: (file: string) => void,
	defaultDelayMs: number,
	timerApi: TimerApi = defaultTimerApi,
): FileCoalescer {
	const pending = new Map<string, unknown>();

	return {
		clear(): void {
			for (const timer of pending.values()) {
				timerApi.clearTimeout(timer);
			}
			pending.clear();
		},
		schedule(file: string, delayMs = defaultDelayMs): boolean {
			if (pending.has(file)) return false;
			const timer = timerApi.setTimeout(() => {
				pending.delete(file);
				handler(file);
			}, delayMs);
			pending.set(file, timer);
			return true;
		},
	};
}
