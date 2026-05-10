import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Container, Text } from "@mariozechner/pi-tui";

import { getStats, indexEntry, purgeAll, searchKB } from "./store.js";

const ENTRY_TYPE = "ctx-kb-indexed";
const TERSE_ENTRY_TYPE = "ctx-kb-terse";

let terseMode = false;

function notify(
	ctx: ExtensionContext | ExtensionCommandContext,
	message: string,
	level: "info" | "warning" | "error" = "info",
) {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
	}
}

function isMessageEntry(
	entry: unknown,
): entry is { type: "message"; message: { role: string; content: unknown; timestamp: number } } {
	return (
		typeof entry === "object" &&
		entry !== null &&
		"type" in entry &&
		(entry as Record<string, unknown>).type === "message"
	);
}

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((p: Record<string, unknown>) => p?.type === "text")
			.map((p: Record<string, unknown>) => p.text)
			.join("\n");
	}
	return "";
}

export default function (pi: ExtensionAPI) {
	// ── Lifecycle: index session messages ──
	pi.on("session_shutdown", () => {
		// Session entries are indexed via the ctx:index command or auto-indexed
		// on shutdown using the session manager. The session_shutdown event
		// in this API version does not pass ExtensionContext, so we skip
		// auto-indexing here and rely on explicit /ctx:index instead.
	});

	// ── Commands ──
	pi.registerCommand("ctx:index", {
		description: "Index all messages in the current session into the knowledge base.",
		async handler(_args, ctx) {
			const sessionId = ctx.sessionManager.getSessionId();
			const projectDir = ctx.sessionManager.getCwd();
			const entries = ctx.sessionManager.getEntries();
			let count = 0;
			for (const entry of entries) {
				if (isMessageEntry(entry)) {
					const { message } = entry;
					if (message.role === "user" || message.role === "assistant" || message.role === "toolResult") {
						indexEntry({
							sessionId,
							projectDir,
							content: extractText(message.content),
							role: message.role as "user" | "assistant" | "toolResult",
							timestamp: message.timestamp,
						});
						count++;
					}
				}
			}
			notify(ctx, `Indexed ${count} messages.`, "info");
		},
	});

	pi.registerCommand("ctx:search", {
		description: "Search the knowledge base. Usage: /ctx:search <query>",
		async handler(args, ctx) {
			const query = args.trim();
			if (!query) {
				notify(ctx, "Usage: /ctx:search <query>", "warning");
				return;
			}
			const projectDir = ctx.sessionManager.getCwd();
			try {
				const results = searchKB(query, projectDir, 5);
				if (results.length === 0) {
					notify(ctx, "No results.", "info");
					return;
				}
				const text = results
					.map((r, i) => `[${i + 1}] ${r.content.slice(0, 200)}... (${r.role}, ${new Date(r.timestamp).toISOString()})`)
					.join("\n\n");
				notify(ctx, text, "info");
			} catch {
				notify(ctx, "Knowledge base search unavailable (better-sqlite3 not installed).", "warning");
			}
		},
	});

	pi.registerCommand("ctx:terse", {
		description: "Toggle terse mode. Usage: /ctx:terse [on|off]",
		async handler(args, ctx) {
			const arg = args.trim().toLowerCase();
			terseMode = arg === "on" ? true : arg === "off" ? false : !terseMode;
			pi.appendEntry(TERSE_ENTRY_TYPE, { enabled: terseMode, timestamp: Date.now() });
			notify(ctx, `Terse mode ${terseMode ? "enabled" : "disabled"}.`, "info");
		},
	});

	pi.registerCommand("ctx:stats", {
		description: "Show knowledge base statistics.",
		async handler(_args, ctx) {
			const stats = getStats();
			const text = [
				`Total indexed: ${stats.totalEntries}`,
				`DB path: ${stats.dbPath}`,
				`FTS5 enabled: ${stats.ftsEnabled ? "yes" : "no"}`,
			].join("\n");
			notify(ctx, text, "info");
		},
	});

	pi.registerCommand("ctx:purge", {
		description: "Delete all entries from the knowledge base.",
		async handler(_args, ctx) {
			purgeAll();
			notify(ctx, "Knowledge base purged.", "info");
		},
	});

	// ── Entry renderers ──
	pi.registerMessageRenderer(TERSE_ENTRY_TYPE, () => {
		const container = new Container();
		container.addChild(new Text("Terse mode active", 0, 0));
		return container;
	});

	pi.registerMessageRenderer(ENTRY_TYPE, () => {
		const container = new Container();
		container.addChild(new Text("Session indexed", 0, 0));
		return container;
	});
}
