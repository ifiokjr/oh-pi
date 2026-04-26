import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createDiscoveryService } from "./src/discovery.js";
import { createQrRenderer } from "./src/qr.js";
import { isRemoteSessionEnv, startRemoteSessionServer } from './src/server.js';
import type { RemoteSessionHandle, RemoteSessionServerOptions } from './src/server.js';
import { createRemoteWidgetController } from './src/widget.js';
import type { RemoteWidgetState } from './src/widget.js';

const HOSTED_UI_URL = "https://pi-remote.dev";
const discovery = createDiscoveryService();
const qrRenderer = createQrRenderer();
const widgetController = createRemoteWidgetController();

function looksLikeAgentSession(value: unknown): boolean {
	return Boolean(
		value &&
		typeof value === "object" &&
		typeof (value as Record<string, unknown>).prompt === "function" &&
		typeof (value as Record<string, unknown>).subscribe === "function",
	);
}

function resolveAttachedSession(ctx: ExtensionContext, pi: ExtensionAPI): any {
	const ctxRecord = ctx as unknown as Record<string, unknown>;
	const piRecord = pi as unknown as Record<string, unknown>;
	const candidates = [
		ctxRecord.session,
		ctxRecord.agentSession,
		ctxRecord.currentSession,
		ctxRecord.runtime,
		piRecord.session,
		piRecord.agentSession,
		piRecord.currentSession,
	];

	for (const candidate of candidates) {
		if (looksLikeAgentSession(candidate)) {
			return candidate;
		}

		if (candidate && typeof candidate === "object") {
			const nestedSession = (candidate as Record<string, unknown>).session;
			if (looksLikeAgentSession(nestedSession)) {
				return nestedSession;
			}
		}
	}

	return undefined;
}

function createWidgetState(handle: RemoteSessionHandle): RemoteWidgetState {
	return {
		clientCount: handle.server.connectedClients,
		connectUrl: handle.connectUrl,
		instanceId: handle.instanceId,
		lanUrl: handle.lanUrl,
		localUrl: handle.localUrl,
		remoteMode: isRemoteSessionEnv(),
		token: handle.token,
		tunnelUrl: handle.tunnelUrl,
	};
}

function formatActiveMessage(handle: RemoteSessionHandle): string {
	return `🌐 Remote active · ${handle.instanceId}\n${handle.connectUrl}`;
}

export default function remoteTailscaleExtension(pi: ExtensionAPI) {
	let activeCtx: ExtensionContext | undefined;
	let activeHandle: RemoteSessionHandle | undefined;
	let startingPromise: Promise<RemoteSessionHandle> | undefined;
	let widgetEnabled = true;
	let qrShownForInstanceId: string | undefined;
	let unsubscribeConnect: (() => void) | undefined;
	let unsubscribeDisconnect: (() => void) | undefined;

	const clearSubscriptions = () => {
		unsubscribeConnect?.();
		unsubscribeDisconnect?.();
		unsubscribeConnect = undefined;
		unsubscribeDisconnect = undefined;
	};

	const syncWidget = (ctx = activeCtx) => {
		if (!ctx) {
			return;
		}

		if (!activeHandle) {
			widgetController.clear(ctx);
			return;
		}

		if (!widgetEnabled) {
			widgetController.setEnabled(false, ctx, createWidgetState(activeHandle));
			return;
		}

		widgetController.setEnabled(true, ctx, createWidgetState(activeHandle));
		widgetController.schedule(ctx, createWidgetState(activeHandle));
	};

	const showQrCode = async (ctx: ExtensionContext) => {
		if (!activeHandle || !widgetEnabled || qrShownForInstanceId === activeHandle.instanceId) {
			return;
		}

		widgetController.flush();
		const qrLines = await qrRenderer.render(activeHandle.connectUrl);
		ctx.ui.notify(`Scan with a browser:\n${qrLines.join("\n")}`, "info");
		qrShownForInstanceId = activeHandle.instanceId;
	};

	const wireClientEvents = (ctx: ExtensionContext, handle: RemoteSessionHandle) => {
		clearSubscriptions();
		unsubscribeConnect = handle.server.on("client_connect", () => {
			syncWidget(ctx);
			ctx.ui.notify("Remote client connected.", "info");
		});
		unsubscribeDisconnect = handle.server.on("client_disconnect", () => {
			syncWidget(ctx);
			ctx.ui.notify("Remote client disconnected.", "info");
		});
	};

	const ensureStarted = async (ctx: ExtensionContext): Promise<RemoteSessionHandle> => {
		activeCtx = ctx;
		/* V8 ignore next -- public entrypoints short-circuit before re-entering ensureStarted when already running. */
		if (activeHandle?.server.isRunning) {
			return activeHandle;
		}

		if (startingPromise) {
			return startingPromise;
		}

		const startOptions: RemoteSessionServerOptions = {
			discovery,
			hostedUiUrl: HOSTED_UI_URL,
			resolveSession: () => resolveAttachedSession(ctx, pi),
		};

		startingPromise = startRemoteSessionServer(startOptions)
			.then((handle) => {
				activeHandle = handle;
				wireClientEvents(ctx, handle);
				syncWidget(ctx);
				return handle;
			})
			.finally(() => {
				startingPromise = undefined;
			});

		return startingPromise;
	};

	const stopRemote = async (ctx?: ExtensionContext) => {
		const targetCtx = ctx ?? activeCtx;
		clearSubscriptions();
		qrShownForInstanceId = undefined;

		if (!activeHandle) {
			widgetController.clear(targetCtx);
			return false;
		}

		await activeHandle.stop();
		activeHandle = undefined;
		widgetController.clear(targetCtx);
		return true;
	};

	pi.registerCommand("remote", {
		description: "Share the current pi session with secure token auth and a Tailscale URL when available.",
		handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
			activeCtx = ctx;
			const trimmed = args?.trim() ?? "";

			if (trimmed === "stop") {
				const stopped = await stopRemote(ctx);
				ctx.ui.notify(stopped ? "Remote access stopped." : "Remote access is not active.", "info");
				return;
			}

			if (activeHandle?.server.isRunning) {
				syncWidget(ctx);
				ctx.ui.notify(formatActiveMessage(activeHandle), "info");
				return;
			}

			ctx.ui.notify("Starting remote access...", "info");
			try {
				const handle = await ensureStarted(ctx);
				ctx.ui.notify(formatActiveMessage(handle), "info");
				await showQrCode(ctx);
			} catch (caughtError) {
				widgetController.clear(ctx);
				ctx.ui.notify(caughtError instanceof Error ? caughtError.message : "Unable to start remote access.", "error");
			}
		},
	});

	pi.registerCommand("remote:widget", {
		description: "Toggle the remote status widget.",
		handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
			activeCtx = ctx;
			const trimmed = args?.trim().toLowerCase();
			const nextValue =
				trimmed === "on"
					? true
					: trimmed === "off"
						? false
						: trimmed === "" || trimmed === undefined
							? !widgetEnabled
							: null;

			if (nextValue === null) {
				ctx.ui.notify("Usage: /remote:widget [on|off]", "warning");
				return;
			}

			widgetEnabled = nextValue;
			if (activeHandle) {
				widgetController.setEnabled(widgetEnabled, ctx, createWidgetState(activeHandle));
				syncWidget(ctx);
			} else if (!widgetEnabled) {
				widgetController.clear(ctx);
			}

			ctx.ui.notify(`Remote widget ${widgetEnabled ? "enabled" : "disabled"}.`, "info");
		},
	});

	pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
		activeCtx = ctx;
		syncWidget(ctx);
		if (!isRemoteSessionEnv() || activeHandle?.server.isRunning || startingPromise) {
			return;
		}

		try {
			const handle = await ensureStarted(ctx);
			ctx.ui.notify(formatActiveMessage(handle), "info");
			await showQrCode(ctx);
		} catch (caughtError) {
			ctx.ui.notify(caughtError instanceof Error ? caughtError.message : "Unable to start remote access.", "error");
		}
	});

	pi.on("session_switch", async (_event: unknown, ctx: ExtensionContext) => {
		activeCtx = ctx;
		syncWidget(ctx);
	});

	pi.on("session_shutdown", async () => {
		await stopRemote();
		widgetController.dispose();
	});
}
