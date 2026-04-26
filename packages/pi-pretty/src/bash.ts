import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { FG_GREEN, FG_RED, FG_YELLOW, fillToolBackground, resolveBaseBackground } from "./theme.js";

export const PRETTY_BASH_TOOL = "bash_pretty";

export function enhanceBashTool(pi: ExtensionAPI): void {
	const original = createBashTool(process.cwd());

	pi.registerTool({
		...original,
		async execute(toolCallId, params, signal, onUpdate): Promise<AgentToolResult<unknown>> {
			resolveBaseBackground(null);
			const result = await original.execute(toolCallId, params, signal, onUpdate);

			const exitCode = (result as unknown as { exitCode?: number }).exitCode ?? 0;
			const ok = exitCode === 0;
			const output = result.content.find((c): c is { type: "text"; text: string } => c.type === "text")?.text ?? "";

			const exitColor = ok ? FG_GREEN : FG_RED;
			const exitSymbol = ok ? "✓" : "✗";
			const summary = `${exitColor}${exitSymbol} exit ${exitCode}\x1b[0m`;

			const lines = output.split("\n");
			const previewLines = lines.slice(0, 20).join("\n");
			const truncated =
				lines.length > 20 ? `${previewLines}\n\n${FG_YELLOW}… ${lines.length - 20} more lines\x1b[0m` : previewLines;

			const body = fillToolBackground(`\n${truncated}\n\n${summary}`);

			return {
				...result,
				content: [{ type: "text", text: body }],
			};
		},
		name: PRETTY_BASH_TOOL,
	});
}
