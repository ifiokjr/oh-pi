export const REMOTE_WIDGET_KEY = "remote-tailscale";
export const REMOTE_STATUS_KEY = "remote";
const DEFAULT_WIDGET_DEBOUNCE_MS = 150;

export interface RemoteWidgetState {
	instanceId: string;
	clientCount: number;
	connectUrl: string;
	localUrl?: string;
	lanUrl?: string;
	tunnelUrl?: string;
	token?: string;
	remoteMode?: boolean;
}

export interface RemoteUiTarget {
	ui: {
		setStatus: (key: string, value: string | undefined) => void;
		setWidget: <TArgs extends unknown[]>(...args: TArgs) => void;
	};
}

export function formatStatusText(clientCount: number): string {
	return `🌐 Remote: ${clientCount} client${clientCount === 1 ? "" : "s"}`;
}

export function formatWidgetLines(state: RemoteWidgetState): string[] {
	const lines = [
		`🌐 Remote ${state.remoteMode ? "(child mode)" : "(current session)"}`,
		`• Instance: ${state.instanceId}`,
		`• Clients: ${state.clientCount}`,
		`• Connect: ${state.connectUrl}`,
	];

	if (state.tunnelUrl) {
		lines.push(`• Tailscale: ${state.tunnelUrl}`);
	}

	if (state.lanUrl) {
		lines.push(`• LAN: ${state.lanUrl}`);
	}

	if (!state.lanUrl && state.localUrl) {
		lines.push(`• Local: ${state.localUrl}`);
	}

	if (state.token) {
		lines.push(`• Token: ${state.token}`);
	}

	return lines;
}

export function createRemoteWidgetController(
	options: {
		key?: string;
		statusKey?: string;
		debounceMs?: number;
	} = {},
) {
	const key = options.key ?? REMOTE_WIDGET_KEY;
	const statusKey = options.statusKey ?? REMOTE_STATUS_KEY;
	const debounceMs = options.debounceMs ?? DEFAULT_WIDGET_DEBOUNCE_MS;

	let enabled = true;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let latestCtx: RemoteUiTarget | undefined;
	let latestState: RemoteWidgetState | undefined;

	const clearTimer = () => {
		if (!timer) {
			return;
		}

		clearTimeout(timer);
		timer = undefined;
	};

	const renderNow = () => {
		if (!latestCtx) {
			return;
		}

		if (!enabled || !latestState) {
			latestCtx.ui.setWidget(key, undefined);
			latestCtx.ui.setStatus(statusKey, undefined);
			return;
		}

		latestCtx.ui.setWidget(key, formatWidgetLines(latestState), { placement: "belowEditor" });
		latestCtx.ui.setStatus(statusKey, formatStatusText(latestState.clientCount));
	};

	return {
		clear(ctx?: RemoteUiTarget) {
			if (ctx) {
				latestCtx = ctx;
			}

			latestState = undefined;
			clearTimer();
			renderNow();
		},
		dispose() {
			clearTimer();
			if (latestCtx) {
				latestCtx.ui.setWidget(key, undefined);
				latestCtx.ui.setStatus(statusKey, undefined);
			}

			latestCtx = undefined;
			latestState = undefined;
		},
		flush() {
			clearTimer();
			renderNow();
		},
		get enabled() {
			return enabled;
		},
		schedule(ctx: RemoteUiTarget, state: RemoteWidgetState) {
			latestCtx = ctx;
			latestState = state;
			clearTimer();
			timer = setTimeout(renderNow, debounceMs);
			timer.unref?.();
		},
		setEnabled(value: boolean, ctx?: RemoteUiTarget, state?: RemoteWidgetState) {
			enabled = value;
			if (ctx) {
				latestCtx = ctx;
			}
			if (state) {
				latestState = state;
			}
			clearTimer();
			renderNow();
		},
	};
}
