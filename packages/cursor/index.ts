import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createCursorOAuthProvider, refreshCursorCredentialModels, refreshCursorToken } from "./auth.js";
import { CURSOR_API, CURSOR_PROVIDER, getCursorRuntimeConfig } from "./config.js";
import { getCredentialModels, getFallbackCursorModels, toProviderModels } from "./models.js";
import type { CursorCredentials } from "./models.js";
import { streamSimpleCursor } from "./provider.js";
import { clearCursorRuntimeState, getCursorRuntimeStateSummary } from "./runtime.js";

function registerCursorProvider(pi: ExtensionAPI): void {
	pi.registerProvider(CURSOR_PROVIDER, {
		api: CURSOR_API,
		baseUrl: getCursorRuntimeConfig().apiUrl,
		models: toProviderModels(getFallbackCursorModels()),
		oauth: createCursorOAuthProvider(),
		streamSimple: streamSimpleCursor,
	});
}

function registerCursorCommand(pi: ExtensionAPI): void {
	pi.registerCommand("cursor", {
		description: "Inspect or refresh the experimental Cursor provider: /cursor [status|refresh-models|clear-state]",
		async handler(args, ctx) {
			const action = args.trim().toLowerCase() || "status";
			if (action === "clear-state") {
				clearCursorRuntimeState();
				ctx.ui.notify("Cleared Cursor provider runtime state.", "info");
				return;
			}

			const { authStorage } = ctx.modelRegistry;
			const credential = authStorage.get(CURSOR_PROVIDER);
			if (!credential || credential.type !== "oauth") {
				ctx.ui.notify("Not logged in to Cursor. Run /login cursor first.", "warning");
				return;
			}

			if (action === "refresh-models") {
				const refreshed =
					credential.expires <= Date.now()
						? await refreshCursorToken(credential)
						: await refreshCursorCredentialModels(credential as CursorCredentials);
				authStorage.set(CURSOR_PROVIDER, { type: "oauth", ...refreshed });
				ctx.modelRegistry.refresh();
				ctx.ui.notify(`Refreshed Cursor models (${getCredentialModels(refreshed).length} available).`, "info");
				return;
			}

			const runtime = getCursorRuntimeStateSummary();
			const models = getCredentialModels(credential as CursorCredentials);
			const expiresInMinutes = Math.max(0, Math.round((credential.expires - Date.now()) / 60_000));
			ctx.ui.notify(
				[
					`Cursor auth: configured`,
					`Models: ${models.length}`,
					`Token expiry: ${expiresInMinutes}m`,
					`Runtime: ${runtime.activeRuns} active run(s), ${runtime.checkpoints} checkpoint(s)`,
				].join("\n"),
				"info",
			);
		},
	});
}

export { createCursorOAuthProvider, generateCursorAuthParams, getTokenExpiry } from "./auth.js";
export {
	type CursorCredentials,
	discoverCursorModels,
	getCredentialModels,
	getFallbackCursorModels,
} from "./models.js";
export { streamSimpleCursor } from "./provider.js";
export {
	clearCursorRuntimeState,
	deriveBridgeKey,
	deriveConversationKey,
	getCursorRuntimeStateSummary,
} from "./runtime.js";

export default function cursorProviderExtension(pi: ExtensionAPI): void {
	registerCursorProvider(pi);
	registerCursorCommand(pi);
}
