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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const DOCS_DIR = join(REPO_ROOT, "docs");
const CONTENT_DIR = join(REPO_ROOT, "packages/docs/src/content");

const TITLE_MAP = {
	"01-overview": {
		description: "Project purpose, design philosophy, package architecture, install, run modes, providers, and auth.",
		order: 1,
		title: "Overview",
	},
	"02-interactive-mode": {
		description: "UI layout, editor features, command system, keybindings, message queue, terminal compatibility.",
		order: 2,
		title: "Interactive Mode",
	},
	"03-sessions": {
		description: "JSONL tree structure, entry types, branching, context compaction, branch summaries.",
		order: 3,
		title: "Session Management",
	},
	"04-extensions": {
		description: "Extension API, event lifecycle, custom tools, UI interaction, state management.",
		order: 4,
		title: "Extension System",
	},
	"05-skills-prompts-themes-packages": {
		description: "Skill packs, prompt templates, theme customization, package management.",
		order: 5,
		title: "Skills, Prompts, Themes & Packages",
	},
	"06-settings-sdk-rpc-tui": {
		description: "All settings, SDK programming interface, RPC protocol, TUI component system.",
		order: 6,
		title: "Settings, SDK, RPC & TUI",
	},
	"07-cli-reference": {
		description: "Complete CLI options, directory structure, platform support.",
		order: 7,
		title: "CLI Reference",
	},
	"feature-catalog": {
		description: "Package-by-package feature inventory.",
		order: 8,
		title: "Feature Catalog",
	},
};

function convertHtmlCommentsToMdx(content) {
	// Convert <!-- {=tagName} --> to {/* MDT: {=tagName} */}
	content = content.replaceAll(/<!--\s*\{=([^}]+)\}\s*-->/g, "{/* MDT: {=$1} */}");
	// Convert <!-- {/tagName} --> to {/* MDT: {/tagName} */}
	content = content.replaceAll(/<!--\s*\{\/([^}]+)\}\s*-->/g, "{/* MDT: {/$1} */}");
	// Convert <!-- {@tagName} --> (provider definitions) to {/* MDT: {@tagName} */}
	content = content.replaceAll(/<!--\s*\{@([^}]+)\}\s*-->/g, "{/* MDT: {@$1} */}");
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

	let source = readFileSync(mdPath, "utf8");
	source = stripFirstH1(source);
	source = convertHtmlCommentsToMdx(source);

	const frontmatter = [
		"---",
		`title: "${meta.title}"`,
		`order: ${meta.order}`,
		meta.description ? `description: "${meta.description}"` : null,
		"---",
		"",
	]
		.filter(Boolean)
		.join("\n");

	const output = `${frontmatter}\n${source.trim()}\n`;

	if (!existsSync(mdxPath) || readFileSync(mdxPath, "utf8") !== output) {
		mkdirSync(CONTENT_DIR, { recursive: true });
		writeFileSync(mdxPath, output, "utf8");
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
