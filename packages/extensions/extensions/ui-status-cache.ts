type StatusTarget = {
	hasUI?: boolean;
	ui?: {
		setStatus?: (key: string, value: string | undefined) => unknown;
	};
};

/**
 * Coalesce repeated status-bar writes so periodic timers do not re-send identical text.
 *
 * Status updates are scoped to the active UI target. When the target changes, the cache is reset so
 * the new session or overlay receives fresh status state.
 */
export function createStatusBarState() {
	let activeTarget: object | null = null;
	const lastValues = new Map<string, string | undefined>();

	return {
		clear() {
			activeTarget = null;
			lastValues.clear();
		},
		set(target: StatusTarget | null | undefined, key: string, value: string | undefined): boolean {
			if (!target || typeof target !== "object") {
				return false;
			}

			if (target !== activeTarget) {
				activeTarget = target;
				lastValues.clear();
			}

			if (!target.hasUI || typeof target.ui?.setStatus !== "function") {
				return false;
			}

			if (lastValues.has(key) && lastValues.get(key) === value) {
				return false;
			}

			lastValues.set(key, value);
			target.ui.setStatus(key, value);
			return true;
		},
	};
}
