#!/usr/bin/env node
/**
 * Synchronize documentation content from docs/*.md into the docs site MDX files.
 *
 * This script:
 * 1. Reads markdown files from the project's docs/ directory
 * 2. Strips the first H1 title (handled by frontmatter/page title)
 * 3. Converts HTML comments to MDX JSX comments
 * 4. Prepends frontmatter with title extracted from the filename
 * 5. Writes the result as MDX files in packages/docs/src/content/
 *
 * Run: pnpm docs:sync
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const DOCS_DIR = join(REPO_ROOT, "docs");
const CONTENT_DIR = join(REPO_ROOT, "packages/docs/src/content");

const TITLE_MAP = {
	"01-overview": { title: "Overview", order: 1, description: "Project purpose, design philosophy, package architecture, install, run modes, providers, and auth." },
	"02-interactive-mode": { title: "Interactive Mode", order: 2, description: "UI layout, editor features, command system, keybindings, message queue, terminal compatibility." },
	"03-sessions": { title: "Session Management", order: 3, description: "JSONL tree structure, entry types, branching, context compaction, branch summaries." },
	"04-extensions": { title: "Extension System", order: 4, description: "Extension API, event lifecycle, custom tools, UI interaction, state management." },
	"05-skills-prompts-themes-packages": { title: "Skills, Prompts, Themes & Packages", order: 5, description: "Skill packs, prompt templates, theme customization, package management." },
	"06-settings-sdk-rpc-tui": { title: "Settings, SDK, RPC & TUI", order: 6, description: "All settings, SDK programming interface, RPC protocol, TUI component system." },
	"07-cli-reference": { title: "CLI Reference", order: 7, description: "Complete CLI options, directory structure, platform support." },
	"feature-catalog": { title: "Feature Catalog", order: 8, description: "Package-by-package feature inventory." },
};

function convertHtmlCommentsToMdx(content) {
	// Convert <!-- {=tagName} --> to {/* MDT: {=tagName} */}
	content = content.replace(/<!--\s*\{=([^\}]+)\}\s*-->/g, "{/* MDT: {=$1} */}");
	// Convert <!-- {/tagName} --> to {/* MDT: {/tagName} */}
	content = content.replace(/<!--\s*\{\/([^\}]+)\}\s*-->/g, "{/* MDT: {/$1} */}");
	// Convert <!-- {@tagName} --> (provider definitions) to {/* MDT: {@tagName} */}
	content = content.replace(/<!--\s*\{@([^\}]+)\}\s*-->/g, "{/* MDT: {@$1} */}");
	return content;
}

function stripFirstH1(content) {
	return content.replace(/^# .+\n\n?/, "");
}

function syncDoc(baseName) {
	const mdPath = join(DOCS_DIR, `${baseName}.md`);
	const mdxPath = join(CONTENT_DIR, `${baseName}.mdx`);

	if (!existsSync(mdPath)) {
		console.warn(`Source file not found: ${mdPath}`);
		return;
	}

	const meta = TITLE_MAP[baseName];
	if (!meta) {
		console.warn(`No metadata for: ${baseName}`);
		return;
	}

	let source = readFileSync(mdPath, "utf-8");
	source = stripFirstH1(source);
	source = convertHtmlCommentsToMdx(source);

	const frontmatter = [
		"---",
		`title: "${meta.title}"`,
		`order: ${meta.order}`,
		meta.description ? `description: "${meta.description}"` : null,
		"---",
		"",
	].filter(Boolean).join("\n");

	const output = `${frontmatter}\n${source.trim()}\n`;

	if (!existsSync(mdxPath) || readFileSync(mdxPath, "utf-8") !== output) {
		mkdirSync(CONTENT_DIR, { recursive: true });
		writeFileSync(mdxPath, output, "utf-8");
		console.log(`Synced: ${baseName}.mdx`);
	} else {
		console.log(`Unchanged: ${baseName}.mdx`);
	}
}

// Sync all known docs
for (const baseName of Object.keys(TITLE_MAP)) {
	syncDoc(baseName);
}

console.log("\nDone! Run `pnpm docs:update` to sync MDT content with providers.");