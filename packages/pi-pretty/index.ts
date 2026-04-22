/**
 * pi-pretty — Pretty terminal output for pi built-in tools.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { enhanceReadTool } from "./src/read.js";
import { enhanceBashTool } from "./src/bash.js";
import { enhanceLsTool } from "./src/ls.js";
import { enhanceFindTool, enhanceGrepTool, enhanceMultiGrepTool } from "./src/find-grep.js";

export default function piPretty(pi: ExtensionAPI) {
	// Wrap built-in tools with enhanced rendering
	enhanceReadTool(pi);
	enhanceBashTool(pi);
	enhanceLsTool(pi);
	enhanceFindTool(pi);
	enhanceGrepTool(pi);
	enhanceMultiGrepTool(pi);

	// Commands for FFF maintenance
	pi.registerCommand("fff-health", {
		description: "Check FFF index health status",
		handler: async (_args, ctx) => {
			const { checkHealth } = await import("./src/fff-helpers.js");
			const status = await checkHealth();
			ctx.ui.notify(status.message, status.ok ? "info" : "warning");
		},
	});

	pi.registerCommand("fff-rescan", {
		description: "Force rescan of current working directory for FFF index",
		handler: async (_args, ctx) => {
			const { rescan } = await import("./src/fff-helpers.js");
			const result = await rescan();
			ctx.ui.notify(result.message, result.ok ? "info" : "error");
		},
	});

	pi.registerCommand("multi-grep", {
		description: "OR-search across multiple string patterns (usage: /multi-grep patterns=[\"a\",\"b\"] glob=\"*.ts\")",
		handler: async (args, ctx) => {
			// Parse args
			const patternsMatch = args.match(/patterns\s*=\s*\[([^\]]+)\]/);
			const globMatch = args.match(/glob\s*=\s*"([^"]+)"/);
			if (!patternsMatch) {
				ctx.ui.notify("Usage: /multi-grep patterns=[\"foo\",\"bar\"] glob=\"*.ts\"", "warning");
				return;
			}
			const raw = patternsMatch[1];
			const patterns = raw.split(",").map((s) => s.trim().replace(/^"/, "").replace(/"$/, "")).filter(Boolean);
			const glob = globMatch?.[1] ?? "*";
			const { multiGrep } = await import("./src/find-grep.js");
			const result = await multiGrep(patterns, glob, ".");
			ctx.ui.notify(result.message || `Found ${result.matches} matches`, result.ok ? "info" : "warning");
		},
	});
}