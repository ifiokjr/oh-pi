import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { codeToANSI } from "@shikijs/cli";
import { basename, extname } from "node:path";
import type { BundledLanguage } from "shiki";
import { detectImageProtocol } from "./image-inline.js";
import { envInt, FG_DIM, fillToolBackground, lnum } from "./theme.js";

const MAX_HL_CHARS = envInt("PRETTY_MAX_HL_CHARS", 80_000);

const EXT_LANG: Record<string, BundledLanguage> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	mjs: "javascript",
	cjs: "javascript",
	py: "python",
	rb: "ruby",
	rs: "rust",
	go: "go",
	java: "java",
	c: "c",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	cs: "csharp",
	swift: "swift",
	kt: "kotlin",
	html: "html",
	css: "css",
	scss: "scss",
	less: "css",
	json: "json",
	jsonc: "jsonc",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	md: "markdown",
	mdx: "mdx",
	sql: "sql",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	lua: "lua",
	php: "php",
	dart: "dart",
	xml: "xml",
	graphql: "graphql",
	svelte: "svelte",
	vue: "vue",
	dockerfile: "dockerfile",
	makefile: "make",
	zig: "zig",
	nim: "nim",
	elixir: "elixir",
	ex: "elixir",
	erb: "erb",
	hbs: "handlebars",
};

export function detectLanguage(fp: string): BundledLanguage | undefined {
	const base = basename(fp).toLowerCase();
	if (base === "dockerfile") return "dockerfile";
	if (base === "makefile" || base === "gnumakefile") return "make";
	if (base === ".envrc" || base === ".env") return "bash";
	return EXT_LANG[extname(fp).slice(1).toLowerCase()];
}

interface HighlightEntry {
	text: string;
	ansi: string;
}
const highlightCache = new Map<string, HighlightEntry>();
const CACHE_LIMIT = envInt("PRETTY_CACHE_LIMIT", 128);

function getCacheKey(text: string, lang: string, theme: string): string {
	return `${lang}::${theme}::${text.slice(0, 200)}::${text.length}`;
}

async function highlightWithCache(text: string, lang: string, theme: string): Promise<string> {
	const key = getCacheKey(text, lang, theme);
	const cached = highlightCache.get(key);
	if (cached) return cached.ansi;
	if (highlightCache.size >= CACHE_LIMIT) {
		const firstKey = highlightCache.keys().next().value;
		if (firstKey !== undefined) highlightCache.delete(firstKey);
	}
	const result = await codeToANSI(text, lang as import("shiki").BundledLanguage, theme as import("shiki").BundledTheme);
	highlightCache.set(key, { text, ansi: result });
	return result;
}

export function enhanceReadTool(pi: ExtensionAPI): void {
	const original = createReadTool(process.cwd());

	pi.registerTool({
		...original,
		async execute(toolCallId, params, signal, onUpdate): Promise<AgentToolResult<unknown>> {
			const result = await original.execute(
				toolCallId,
				params as Parameters<typeof original.execute>[1],
				signal,
				onUpdate,
			);
			const path =
				typeof params === "object" && params !== null && "path" in params ? (params as { path: string }).path : "";

			const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];
			const isImage = imageExts.some((ext) => path.toLowerCase().endsWith(ext));
			if (isImage) {
				const protocol = detectImageProtocol();
				if (protocol !== "none") {
					return result;
				}
			}

			const text = result.content.find((c): c is { type: "text"; text: string } => c.type === "text")?.text ?? "";
			const lines = text.split("\n");
			const maxDigits = String(lines.length).length;
			const numbered = lines.map((line, i) => `${lnum(i + 1, maxDigits)}${FG_DIM} │ ${line}`).join("\n");

			const byteLen = Buffer.byteLength(text, "utf-8");
			let highlighted = numbered;
			if (byteLen <= MAX_HL_CHARS) {
				const lang = detectLanguage(path);
				if (lang) {
					try {
						const theme = (process.env.PRETTY_THEME as string) || "github-dark";
						highlighted = await highlightWithCache(text, lang, theme);
						const hlLines = highlighted.split("\n");
						highlighted = hlLines.map((line, i) => `${lnum(i + 1, maxDigits)}${FG_DIM} │ ${line}`).join("\n");
					} catch {
						// Fallback to plain line-numbered text
					}
				}
			}

			return {
				...result,
				content: [{ type: "text" as const, text: highlighted }],
			};
		},
	});
}
