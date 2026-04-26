interface StatusTarget {
	hasUI?: boolean;
	ui?: {
		setStatus?: (key: string, value: string | undefined) => unknown;
	};
}

/**
 * Coalesce repeated ant-colony status-bar writes so background progress signals do not re-send
 * identical text on every render event.
 */
export function createStatusBarState() {
	let activeTarget: object | null = null;
	const lastValues = new Map<string, string | undefined>();

	return {
		set(target: StatusTarget | null | undefined, key: string, value: string | undefined): boolean {
			if (!target || typeof target !== "object") {
				return false;
			}

			if (target !== activeTarget) {
				activeTarget = target;
				lastValues.clear();
			}

			if (typeof target.ui?.setStatus !== "function") {
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
