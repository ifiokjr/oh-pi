import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createLsTool } from "@mariozechner/pi-coding-agent";
import { getDirectoryIcon, getFileIcon } from "./icons.js";
import { FG_DIM, FG_MUTED, fillToolBackground } from "./theme.js";

const TREE_PIPE = "│ ";
const TREE_BRANCH = "├── ";
const TREE_LAST = "└── ";
const TREE_INDENT = "    ";

interface FileEntry {
	name: string;
	isDirectory: boolean;
	children?: FileEntry[];
}

function sortEntries(a: FileEntry, b: FileEntry): number {
	if (a.isDirectory && !b.isDirectory) {
		return -1;
	}
	if (!a.isDirectory && b.isDirectory) {
		return 1;
	}
	return a.name.localeCompare(b.name);
}

function renderTree(entries: FileEntry[], prefix = ""): string {
	const lines: string[] = [];
	const sorted = [...entries].toSorted(sortEntries);
	for (let i = 0; i < sorted.length; i++) {
		const entry = sorted[i];
		const last = i === sorted.length - 1;
		const branch = last ? TREE_LAST : TREE_BRANCH;
		const icon = entry.isDirectory ? getDirectoryIcon() : getFileIcon(entry.name);
		const dimArrow = entry.isDirectory ? `${FG_DIM}▸${FG_MUTED}` : "";
		lines.push(`${prefix}${branch}${icon} ${entry.name}${dimArrow}`);
		if (entry.isDirectory && entry.children) {
			const childPrefix = prefix + (last ? TREE_INDENT : TREE_PIPE);
			lines.push(renderTree(entry.children, childPrefix));
		}
	}
	return lines.join("\n");
}

export { renderTree };

export function enhanceLsTool(pi: ExtensionAPI): void {
	const original = createLsTool(process.cwd());

	pi.registerTool({
		...original,
		async execute(toolCallId, params, signal, onUpdate): Promise<AgentToolResult<unknown>> {
			const result = await original.execute(toolCallId, params as unknown, signal, onUpdate);
			const text = result.content.find((c): c is { type: "text"; text: string } => c.type === "text")?.text ?? "";
			let entries: FileEntry[] = [];
			if (text.startsWith("[") || text.startsWith("{")) {
				try {
					const parsed = JSON.parse(text);
					entries = Array.isArray(parsed) ? parsed : (parsed.files ?? []);
				} catch {
					// Fallback to plain text
				}
			}

			if (entries.length > 0) {
				const treeLines = renderTree(entries);
				const output = fillToolBackground(treeLines);
				return {
					...result,
					content: [{ text: output, type: "text" as const }],
				};
			}

			const lines = text.split("\n");
			const withIcons = lines.map((line) => {
				if (line.endsWith("/")) {
					return `${getDirectoryIcon()} ${line}`;
				}
				return `${getFileIcon(line)} ${line}`;
			});
			return {
				...result,
				content: [{ text: fillToolBackground(withIcons.join("\n")), type: "text" as const }],
			};
		},
	});
}
