import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { createFindTool, createGrepTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { FG_BLUE, FG_DIM, FG_MUTED, fillToolBackground, RST } from "./theme.js";
import { getFileIcon } from "./icons.js";

function groupResultsByDir(files: string[]): Record<string, string[]> {
	const groups: Record<string, string[]> = {};
	for (const file of files) {
		const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ".";
		if (groups[dir]) {
			groups[dir].push(file);
		} else {
			groups[dir] = [file];
		}
	}
	return groups;
}

function renderFindResults(files: string[]): string {
	if (files.length === 0) return fillToolBackground(`${FG_DIM}No matches found.${RST}`);
	const groups = groupResultsByDir(files);
	const lines: string[] = [];
	for (const [dir, groupFiles] of Object.entries(groups)) {
		lines.push(`${FG_BLUE}▸ ${dir}/${RST}`);
		for (const f of groupFiles) {
			const name = f.slice(Math.max(0, dir.length + (dir === "." ? 0 : 1)));
			lines.push(`  ${getFileIcon(name)}${name}`);
		}
		lines.push("");
	}
	return fillToolBackground(lines.join("\n").trimEnd());
}

function renderGrepResults(files: Array<{ file: string; matches: Array<{ line: number; text: string }> }>): string {
	if (files.length === 0) return fillToolBackground(`${FG_DIM}No matches found.${RST}`);
	const lines: string[] = [];
	for (const { file, matches } of files) {
		lines.push(`${FG_BLUE}▸ ${file}${RST}`);
		for (const m of matches) {
			const numStr = String(m.line).padStart(4, " ");
			lines.push(`  ${FG_MUTED}${numStr}${FG_DIM} │${RST} ${m.text}`);
		}
		lines.push("");
	}
	return fillToolBackground(lines.join("\n").trimEnd());
}

export function enhanceFindTool(pi: ExtensionAPI): void {
	const original = createFindTool(process.cwd());

	pi.registerTool({
		...original,
		async execute(toolCallId, params, signal, onUpdate): Promise<AgentToolResult<unknown>> {
			const result = await original.execute(toolCallId, params as any, signal, onUpdate);
			const text = result.content.find((c): c is { type: "text"; text: string } => c.type === "text")?.text ?? "";
			let files: string[] = [];
			if (text.startsWith("[") || text.startsWith("{")) {
				try {
					const parsed = JSON.parse(text);
					files = Array.isArray(parsed) ? parsed : parsed.files ?? [];
				} catch {
					files = text.split("\n").filter(Boolean);
				}
			} else {
				files = text.split("\n").filter(Boolean);
			}
			if (files.length > 0) {
				return {
					...result,
					content: [{ type: "text" as const, text: renderFindResults(files) }],
				};
			}
			return result;
		},
	});
}

export function enhanceGrepTool(pi: ExtensionAPI): void {
	const original = createGrepTool(process.cwd());

	pi.registerTool({
		...original,
		async execute(toolCallId, params, signal, onUpdate): Promise<AgentToolResult<unknown>> {
			const result = await original.execute(toolCallId, params as any, signal, onUpdate);
			const text = result.content.find((c): c is { type: "text"; text: string } => c.type === "text")?.text ?? "";
			if (text.startsWith("[")) {
				try {
					const parsed = JSON.parse(text) as Array<{ file: string; matches: Array<{ line: number; text: string }> }>;
					if (Array.isArray(parsed) && parsed[0]?.matches) {
						return {
							...result,
							content: [{ type: "text" as const, text: renderGrepResults(parsed) }],
						};
					}
				} catch {
					// Fallback
				}
			}
			return result;
		},
	});
}

const multiGrepParams = Type.Object({
	patterns: Type.Array(Type.String(), { description: "Multiple patterns to search for (OR logic)" }),
	path: Type.Optional(Type.String({ description: "Base directory or file to search within" })),
	glob: Type.Optional(Type.String({ description: "File glob constraint (e.g. *.ts)" })),
});

export function enhanceMultiGrepTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "multi_grep",
		label: "multi_grep",
		description: "OR-search across multiple string patterns in one pass",
		parameters: multiGrepParams,
		async execute(_toolCallId, params, _signal, _onUpdate): Promise<AgentToolResult<unknown>> {
			const { patterns, path: basePath = ".", glob = "*" } = params as { patterns: string[]; path?: string; glob?: string };
			const result = execMultiGrep(patterns, glob, basePath);
			return {
				content: [{ type: "text" as const, text: result.message }],
				details: result,
			};
		},
	});
}

interface MultiGrepResult {
	ok: boolean;
	message: string;
	matches: number;
	results: Array<{ file: string; matches: Array<{ line: number; text: string; pattern: string }> }>;
}

function execMultiGrep(patterns: string[], glob: string, basePath: string): MultiGrepResult {
	const { execSync } = require("node:child_process");
	const results: MultiGrepResult["results"] = [];
	let totalMatches = 0;
	for (const pattern of patterns) {
		try {
			const output = execSync(
				`grep -rn --include="${glob}" "${pattern.replace(/"/g, '\\"')}" "${basePath}"`,
				{ encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] },
			);
			const lines = output.split("\n").filter(Boolean);
			for (const line of lines) {
				const [file, lineNum, ...textParts] = line.split(":");
				const text = textParts.join(":");
				if (!file || !lineNum) continue;
				const num = Number(lineNum);
				const existing = results.find((r) => r.file === file);
				if (existing) {
					existing.matches.push({ line: num, text, pattern });
				} else {
					results.push({ file, matches: [{ line: num, text, pattern }] });
				}
			}
			totalMatches += lines.length;
		} catch {
			// grep returns exit 1 when no matches
		}
	}
	return {
		ok: totalMatches > 0,
		message: totalMatches > 0 ? `Found ${totalMatches} matches` : "No matches",
		matches: totalMatches,
		results,
	};
}

export { execMultiGrep as multiGrep };