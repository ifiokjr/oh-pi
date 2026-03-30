export type SafeModeSource = "manual" | "watchdog";

export type SafeModeState = {
	enabled: boolean;
	source: SafeModeSource | null;
	reason: string | null;
	auto: boolean;
	updatedAt: number;
};

type SafeModeListener = (state: SafeModeState) => void;

const listeners = new Set<SafeModeListener>();

let safeModeState: SafeModeState = {
	enabled: false,
	source: null,
	reason: null,
	auto: false,
	updatedAt: Date.now(),
};

export function getSafeModeState(): SafeModeState {
	return safeModeState;
}

export function isSafeModeEnabled(): boolean {
	return safeModeState.enabled;
}

export function setSafeModeState(
	enabled: boolean,
	options: { source?: SafeModeSource | null; reason?: string | null; auto?: boolean; updatedAt?: number } = {},
): SafeModeState {
	const nextState: SafeModeState = {
		enabled,
		source: enabled ? (options.source ?? safeModeState.source ?? "manual") : null,
		reason: enabled ? (options.reason ?? safeModeState.reason ?? null) : null,
		auto: enabled ? (options.auto ?? safeModeState.auto) : false,
		updatedAt: options.updatedAt ?? Date.now(),
	};

	if (
		nextState.enabled === safeModeState.enabled &&
		nextState.source === safeModeState.source &&
		nextState.reason === safeModeState.reason &&
		nextState.auto === safeModeState.auto
	) {
		return safeModeState;
	}

	safeModeState = nextState;
	for (const listener of listeners) {
		listener(safeModeState);
	}
	return safeModeState;
}

export function subscribeSafeMode(listener: SafeModeListener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function resetSafeModeStateForTests(): void {
	listeners.clear();
	safeModeState = {
		enabled: false,
		source: null,
		reason: null,
		auto: false,
		updatedAt: Date.now(),
	};
}
