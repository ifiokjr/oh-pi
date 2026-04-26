export interface MdxPageData {
	slug: string;
	title: string;
	order: number;
	description?: string;
	module: () => Promise<{ default: React.ComponentType }>;
}

const mdxModules = import.meta.glob<{ default: React.ComponentType }>("../content/**/*.mdx", {
	eager: false,
});

function extractFrontmatter(modulePath: string): { title: string; order: number; description?: string } {
	// We can't read the raw file at runtime in the browser,
	// So we encode frontmatter in the module path convention.
	// Instead, we parse the slug for ordering.
	const fileName = modulePath.split("/").pop() ?? "";
	const match = fileName.match(/^(\d+)-(.+)\.mdx$/);
	if (match) {
		const order = Number.parseInt(match[1], 10);
		const titleSlug = match[2].replaceAll(/-/g, " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
		return { order, title: titleSlug };
	}
	return { order: 999, title: fileName.replace(/\.mdx$/, "").replace(/-/g, " ") };
}

// Static frontmatter map — keeps MDX content clean while providing rich metadata.
// Order matches the original docs numbering.
const frontmatterMap: Record<string, { title: string; order: number; description: string }> = {
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
		description: "Extension API, event lifecycle, custom tools, UI interaction, state management, example index.",
		order: 4,
		title: "Extension System",
	},
	"05-skills-prompts-themes-packages": {
		description: "Skill packs, prompt templates, theme customization, package management and distribution.",
		order: 5,
		title: "Skills, Prompts, Themes & Packages",
	},
	"06-settings-sdk-rpc-tui": {
		description: "All settings, SDK programming interface, RPC protocol, TUI component system, custom models.",
		order: 6,
		title: "Settings, SDK, RPC & TUI",
	},
	"07-cli-reference": {
		description: "Complete CLI options, directory structure, platform support, key numbers.",
		order: 7,
		title: "CLI Reference",
	},
	"feature-catalog": {
		description: "Package-by-package feature inventory, local dev loop, runtime/content package ownership.",
		order: 8,
		title: "Feature Catalog",
	},
};

export function useMdxPages(): MdxPageData[] {
	const pages = Object.entries(mdxModules).map(([modulePath, module]): MdxPageData => {
		const fileName = modulePath.split("/").pop() ?? "";
		const slug = fileName.replace(/\.mdx$/, "");
		const staticMeta = frontmatterMap[slug];
		const fallbackMeta = extractFrontmatter(modulePath);

		return {
			description: staticMeta?.description,
			module: module as () => Promise<{ default: React.ComponentType }>,
			order: staticMeta?.order ?? fallbackMeta.order,
			slug,
			title: staticMeta?.title ?? fallbackMeta.title,
		};
	});

	return pages.toSorted((a, b) => a.order - b.order);
}
