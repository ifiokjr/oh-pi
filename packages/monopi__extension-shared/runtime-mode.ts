export type SafeModeSource = "manual" | "watchdog";

export interface SafeModeState {
	enabled: boolean;
	source: SafeModeSource | null;
	reason: string | null;
	auto: boolean;
	updatedAt: number;
}

type SafeModeListener = (state: SafeModeState) => void;

const listeners = new Set<SafeModeListener>();

let safeModeState: SafeModeState = {
	auto: false,
	enabled: false,
	reason: null,
	source: null,
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
	options: {
		source?: SafeModeSource | null;
		reason?: string | null;
		auto?: boolean;
		updatedAt?: number;
	} = {},
): SafeModeState {
	const nextState: SafeModeState = {
		auto: enabled ? (options.auto ?? safeModeState.auto) : false,
		enabled,
		reason: enabled ? (options.reason ?? safeModeState.reason ?? null) : null,
		source: enabled ? (options.source ?? safeModeState.source ?? "manual") : null,
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
		auto: false,
		enabled: false,
		reason: null,
		source: null,
		updatedAt: Date.now(),
	};
}
