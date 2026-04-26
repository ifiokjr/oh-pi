import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { GitClient } from "./git.js";
import type { PreparedFeature, WorkflowPaths } from "./types.js";

const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"add",
	"are",
	"as",
	"at",
	"be",
	"been",
	"being",
	"by",
	"can",
	"could",
	"did",
	"do",
	"does",
	"for",
	"from",
	"get",
	"had",
	"has",
	"have",
	"i",
	"in",
	"is",
	"it",
	"may",
	"might",
	"must",
	"my",
	"need",
	"of",
	"on",
	"or",
	"our",
	"set",
	"shall",
	"should",
	"that",
	"the",
	"their",
	"these",
	"this",
	"those",
	"to",
	"want",
	"was",
	"were",
	"will",
	"with",
	"would",
	"your",
]);

export function findRepoRoot(cwd: string, git: GitClient): { repoRoot: string; hasGit: boolean } {
	const gitRoot = git.getRepoRoot(cwd);
	if (gitRoot) {
		return { hasGit: true, repoRoot: gitRoot };
	}

	let current = path.resolve(cwd);
	while (true) {
		if (existsSync(path.join(current, ".specify"))) {
			return { hasGit: false, repoRoot: current };
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return { hasGit: false, repoRoot: path.resolve(cwd) };
		}
		current = parent;
	}
}

export function listFeatureDirs(repoRoot: string): string[] {
	const specsDir = path.join(repoRoot, "specs");
	if (!existsSync(specsDir)) {
		return [];
	}

	return readdirSync(specsDir)
		.filter((entry) => /^\d{3}-/.test(entry))
		.filter((entry) => {
			const fullPath = path.join(specsDir, entry);
			return existsSync(fullPath) && statSync(fullPath).isDirectory();
		})
		.sort((a: string, b: string) => a.localeCompare(b));
}

export function getLatestFeatureDir(repoRoot: string): string | undefined {
	const features = listFeatureDirs(repoRoot);
	return features.at(-1);
}

export function extractFeatureNumber(value: string): number | null {
	const match = value.match(/^(\d{3})-/);
	if (!match) {
		return null;
	}
	return Number.parseInt(match[1], 10);
}

export function resolveFeatureFromBranch(repoRoot: string, branchName: string): string | undefined {
	const prefix = branchName.match(/^(\d{3})-/)?.[1];
	if (!prefix) {
		return undefined;
	}
	const matches = listFeatureDirs(repoRoot).filter((entry) => entry.startsWith(`${prefix}-`));
	if (matches.length === 1) {
		return matches[0];
	}
	return matches.find((entry) => entry === branchName) ?? undefined;
}

export function buildWorkflowPaths(repoRoot: string, featureName?: string): WorkflowPaths {
	const specifyDir = path.join(repoRoot, ".specify");
	const templatesDir = path.join(specifyDir, "templates");
	const memoryDir = path.join(specifyDir, "memory");
	const featureDir = featureName ? path.join(repoRoot, "specs", featureName) : undefined;
	return {
		agentContextFile: path.join(memoryDir, "pi-agent.md"),
		checklistsDir: featureDir ? path.join(featureDir, "checklists") : undefined,
		constitutionFile: path.join(memoryDir, "constitution.md"),
		contractsDir: featureDir ? path.join(featureDir, "contracts") : undefined,
		dataModelFile: featureDir ? path.join(featureDir, "data-model.md") : undefined,
		extensionsConfigFile: path.join(specifyDir, "extensions.yml"),
		featureBranch: featureName,
		featureDir,
		featureNumber: featureName?.match(/^(\d{3})-/)?.[1],
		featureSpec: featureDir ? path.join(featureDir, "spec.md") : undefined,
		memoryDir,
		planFile: featureDir ? path.join(featureDir, "plan.md") : undefined,
		quickstartFile: featureDir ? path.join(featureDir, "quickstart.md") : undefined,
		repoRoot,
		researchFile: featureDir ? path.join(featureDir, "research.md") : undefined,
		specifyDir,
		specsDir: path.join(repoRoot, "specs"),
		tasksFile: featureDir ? path.join(featureDir, "tasks.md") : undefined,
		templatesDir,
		workflowReadmeFile: path.join(specifyDir, "README.md"),
	};
}

export function cleanBranchSegment(value: string): string {
	return value
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/-+/g, "-")
		.replaceAll(/^-|-$/g, "");
}

export function generateBranchShortName(description: string): string {
	const tokens = description.match(/[A-Za-z0-9]+/g) ?? [];
	const meaningful: string[] = [];

	for (const original of tokens) {
		const normalized = original.toLowerCase();
		if (!normalized || STOP_WORDS.has(normalized)) {
			continue;
		}

		const isAcronymLike = /[A-Z]{2,}/.test(original) || /\d/.test(original);
		if (normalized.length >= 3 || isAcronymLike) {
			meaningful.push(normalized);
		}
	}

	const selected = (meaningful.length > 0 ? meaningful : tokens.map((token) => token.toLowerCase()))
		.filter(Boolean)
		.slice(0, meaningful.length === 4 ? 4 : 3);

	const fallback = selected.join("-") || "feature";
	return cleanBranchSegment(fallback) || "feature";
}

export function truncateBranchName(branchName: string): string {
	const MAX_BRANCH_LENGTH = 244;
	if (branchName.length <= MAX_BRANCH_LENGTH) {
		return branchName;
	}
	const prefix = branchName.slice(0, 4);
	const suffix = branchName.slice(4, MAX_BRANCH_LENGTH).replaceAll(/-+$/g, "");
	return `${prefix}${suffix}`;
}

export function computeNextFeatureNumber(repoRoot: string, branches: string[]): number {
	const featureNumbers = [
		...listFeatureDirs(repoRoot)
			.map((entry) => extractFeatureNumber(entry))
			.filter((value): value is number => value != null),
		...branches
			.map((entry) => entry.replace(/^[^/]+\//, ""))
			.map((entry) => extractFeatureNumber(entry))
			.filter((value): value is number => value != null),
	];
	const highest = featureNumbers.length > 0 ? Math.max(...featureNumbers) : 0;
	return highest + 1;
}

export function prepareFeatureWorkspace(options: {
	repoRoot: string;
	description: string;
	git: GitClient;
	currentBranch: string;
	hasGit: boolean;
	shortName?: string;
}): PreparedFeature {
	const featureNumber = String(
		computeNextFeatureNumber(options.repoRoot, options.git.listBranches(options.repoRoot)),
	).padStart(3, "0");
	const branchSuffix =
		cleanBranchSegment(options.shortName || generateBranchShortName(options.description)) || "feature";
	const branchName = truncateBranchName(`${featureNumber}-${branchSuffix}`);
	const featureDir = path.join(options.repoRoot, "specs", branchName);
	const specFile = path.join(featureDir, "spec.md");
	const checklistsDir = path.join(featureDir, "checklists");

	mkdirSync(featureDir, { recursive: true });
	mkdirSync(checklistsDir, { recursive: true });

	let createdBranch = false;
	if (options.hasGit) {
		if (options.currentBranch !== branchName) {
			options.git.createAndSwitchBranch(options.repoRoot, branchName);
			createdBranch = true;
		}
	}

	return {
		branchName,
		checklistsDir,
		createdBranch,
		featureDir,
		featureNumber,
		specFile,
	};
}
