
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
	// so we encode frontmatter in the module path convention.
	// Instead, we parse the slug for ordering.
	const fileName = modulePath.split("/").pop() ?? "";
	const match = fileName.match(/^(\d+)-(.+)\.mdx$/);
	if (match) {
		const order = Number.parseInt(match[1], 10);
		const titleSlug = match[2]
			.replace(/-/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase());
		return { title: titleSlug, order };
	}
	return { title: fileName.replace(/\.mdx$/, "").replace(/-/g, " "), order: 999 };
}

// Static frontmatter map — keeps MDX content clean while providing rich metadata.
// Order matches the original docs numbering.
const frontmatterMap: Record<string, { title: string; order: number; description: string }> = {
	"01-overview": {
		title: "Overview",
		order: 1,
		description: "Project purpose, design philosophy, package architecture, install, run modes, providers, and auth.",
	},
	"02-interactive-mode": {
		title: "Interactive Mode",
		order: 2,
		description: "UI layout, editor features, command system, keybindings, message queue, terminal compatibility.",
	},
	"03-sessions": {
		title: "Session Management",
		order: 3,
		description: "JSONL tree structure, entry types, branching, context compaction, branch summaries.",
	},
	"04-extensions": {
		title: "Extension System",
		order: 4,
		description: "Extension API, event lifecycle, custom tools, UI interaction, state management, example index.",
	},
	"05-skills-prompts-themes-packages": {
		title: "Skills, Prompts, Themes & Packages",
		order: 5,
		description: "Skill packs, prompt templates, theme customization, package management and distribution.",
	},
	"06-settings-sdk-rpc-tui": {
		title: "Settings, SDK, RPC & TUI",
		order: 6,
		description: "All settings, SDK programming interface, RPC protocol, TUI component system, custom models.",
	},
	"07-cli-reference": {
		title: "CLI Reference",
		order: 7,
		description: "Complete CLI options, directory structure, platform support, key numbers.",
	},
	"feature-catalog": {
		title: "Feature Catalog",
		order: 8,
		description: "Package-by-package feature inventory, local dev loop, runtime/content package ownership.",
	},
};

export function useMdxPages(): MdxPageData[] {
	const pages = Object.entries(mdxModules).map(([modulePath, module]): MdxPageData => {
		const fileName = modulePath.split("/").pop() ?? "";
		const slug = fileName.replace(/\.mdx$/, "");
		const staticMeta = frontmatterMap[slug];
		const fallbackMeta = extractFrontmatter(modulePath);

		return {
			slug,
			title: staticMeta?.title ?? fallbackMeta.title,
			order: staticMeta?.order ?? fallbackMeta.order,
			description: staticMeta?.description,
			module: module as () => Promise<{ default: React.ComponentType }>,
		};
	});

	return pages.sort((a, b) => a.order - b.order);
}