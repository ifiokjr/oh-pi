import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { ChecklistSummary, WorkflowPaths, WorkflowStatus } from "./types.js";
import { getLatestFeatureDir, listFeatureDirs } from "./workspace.js";

function countChecklistItems(content: string): { total: number; completed: number; incomplete: number } {
	const lines = content.split(/\r?\n/);
	let total = 0;
	let completed = 0;
	let incomplete = 0;
	for (const line of lines) {
		if (/^- \[(?: |x|X)\]/.test(line)) {
			total++;
			if (/^- \[(?:x|X)\]/.test(line)) {
				completed++;
			} else {
				incomplete++;
			}
		}
	}
	return { completed, incomplete, total };
}

export function summarizeChecklists(checklistsDir?: string): ChecklistSummary[] {
	if (!(checklistsDir && existsSync(checklistsDir))) {
		return [];
	}

	return readdirSync(checklistsDir)
		.filter((entry) => entry.endsWith(".md"))
		.map((entry) => {
			const fullPath = path.join(checklistsDir, entry);
			const content = readFileSync(fullPath, "utf8");
			const counts = countChecklistItems(content);
			return {
				name: entry,
				path: fullPath,
				...counts,
				status: counts.incomplete === 0 ? "pass" : "fail",
			} satisfies ChecklistSummary;
		})
		.toSorted((a, b) => a.name.localeCompare(b.name));
}

function nextStepsFor(paths: WorkflowPaths, initialized: boolean): string[] {
	if (!initialized) {
		return ["/spec:init", "/spec:constitution <principles>", "/spec:specify <feature description>"];
	}

	if (!(paths.featureDir && paths.featureSpec)) {
		return ["/spec:specify <feature description>", "/spec:list"];
	}

	const steps: string[] = [];
	const specExists = existsSync(paths.featureSpec);
	const planExists = Boolean(paths.planFile) && existsSync(paths.planFile);
	const tasksExist = Boolean(paths.tasksFile) && existsSync(paths.tasksFile);
	const checklists = summarizeChecklists(paths.checklistsDir);
	const hasIncompleteChecklist = checklists.some((checklist) => checklist.incomplete > 0);

	if (!specExists) {
		steps.push("/spec:specify <feature description>");
		return steps;
	}

	steps.push("/spec:clarify");
	steps.push("/spec:checklist quality");

	if (!planExists) {
		steps.push("/spec:plan <technical context>");
		return steps;
	}

	if (!tasksExist) {
		steps.push("/spec:tasks");
		return steps;
	}

	steps.push("/spec:analyze");
	steps.push(hasIncompleteChecklist ? "/spec:implement (after checklist review)" : "/spec:implement");

	return steps;
}

export function buildWorkflowStatus(options: {
	repoRoot: string;
	currentBranch: string;
	paths: WorkflowPaths;
	activeFeature?: string;
}): WorkflowStatus {
	const featureDirs = listFeatureDirs(options.repoRoot);
	const activeFeature = options.activeFeature ?? getLatestFeatureDir(options.repoRoot);
	const initialized = existsSync(options.paths.specifyDir);
	const artifacts = [
		{
			exists: existsSync(options.paths.workflowReadmeFile),
			label: ".specify/README.md",
			path: options.paths.workflowReadmeFile,
		},
		{
			exists: existsSync(options.paths.constitutionFile),
			label: "constitution.md",
			path: options.paths.constitutionFile,
		},
		{ exists: existsSync(options.paths.agentContextFile), label: "pi-agent.md", path: options.paths.agentContextFile },
		{
			exists: existsSync(options.paths.extensionsConfigFile),
			label: "extensions.yml",
			path: options.paths.extensionsConfigFile,
		},
	];

	if (options.paths.featureSpec) {
		artifacts.push({
			exists: existsSync(options.paths.featureSpec),
			label: "spec.md",
			path: options.paths.featureSpec,
		});
	}

	if (options.paths.planFile) {
		artifacts.push({ exists: existsSync(options.paths.planFile), label: "plan.md", path: options.paths.planFile });
	}

	if (options.paths.tasksFile) {
		artifacts.push({ exists: existsSync(options.paths.tasksFile), label: "tasks.md", path: options.paths.tasksFile });
	}

	if (options.paths.researchFile) {
		artifacts.push({
			exists: existsSync(options.paths.researchFile),
			label: "research.md",
			path: options.paths.researchFile,
		});
	}

	if (options.paths.dataModelFile) {
		artifacts.push({
			exists: existsSync(options.paths.dataModelFile),
			label: "data-model.md",
			path: options.paths.dataModelFile,
		});
	}

	if (options.paths.quickstartFile) {
		artifacts.push({
			exists: existsSync(options.paths.quickstartFile),
			label: "quickstart.md",
			path: options.paths.quickstartFile,
		});
	}

	if (options.paths.contractsDir) {
		artifacts.push({
			exists: existsSync(options.paths.contractsDir) && statSync(options.paths.contractsDir).isDirectory(),
			label: "contracts/",
			path: options.paths.contractsDir,
		});
	}

	return {
		activeFeature,
		artifacts,
		checklists: summarizeChecklists(options.paths.checklistsDir),
		currentBranch: options.currentBranch,
		featureDirs,
		initialized,
		nextSteps: nextStepsFor(options.paths, initialized),
		paths: options.paths,
		repoRoot: options.repoRoot,
	};
}

export function formatWorkflowStatus(status: WorkflowStatus): string {
	const lines = [
		"# /spec:status",
		"",
		`- Repository root: ${status.repoRoot}`,
		`- Initialized: ${status.initialized ? "yes" : "no"}`,
		`- Current branch: ${status.currentBranch}`,
		`- Active feature: ${status.activeFeature ?? "(none)"}`,
		`- Known features: ${status.featureDirs.length > 0 ? status.featureDirs.join(", ") : "(none)"}`,
		"",
		"## Artifacts",
	];

	for (const artifact of status.artifacts) {
		lines.push(`- ${artifact.exists ? "[x]" : "[ ]"} ${artifact.label} — ${artifact.path}`);
	}

	lines.push("", "## Checklist status");
	if (status.checklists.length === 0) {
		lines.push("- No checklist files found.");
	} else {
		for (const checklist of status.checklists) {
			lines.push(
				`- ${checklist.status === "pass" ? "[ok]" : "[!]"} ${checklist.name}: ${checklist.completed}/${checklist.total} complete (${checklist.incomplete} incomplete)`,
			);
		}
	}

	lines.push("", "## Next steps");
	for (const step of status.nextSteps) {
		lines.push(`- ${step}`);
	}
	return lines.join("\n");
}

export function formatHelpReport(): string {
	return [
		"# Native /spec workflow",
		"",
		"Use `/spec` or `/spec:<subcommand>` with one of these commands:",
		"",
		"- `/spec:init` — scaffold `.specify/`, templates, and memory files",
		"- `/spec:constitution <principles>` — create or amend the project constitution",
		"- `/spec:specify <feature description>` — create a numbered feature branch and spec scaffold",
		"- `/spec:clarify [focus]` — resolve critical ambiguities in the active spec",
		"- `/spec:checklist [domain]` — generate a requirements-quality checklist",
		"- `/spec:plan <technical context>` — build the implementation plan and design artifacts",
		"- `/spec:tasks [context]` — derive an executable tasks.md ordered by user story",
		"- `/spec:analyze [focus]` — run a read-only cross-artifact consistency review",
		"- `/spec:implement [focus]` — execute the plan from tasks.md and mark completed tasks",
		"- `/spec:status` — show current workflow state",
		"- `/spec:next` — show the next recommended command",
		"- `/spec:list` — list all known feature directories",
		"",
		"Tip: `/spec:status` shows the current workflow status.",
	].join("\n");
}

export function formatFeatureList(repoRoot: string): string {
	const features = listFeatureDirs(repoRoot);
	if (features.length === 0) {
		return "# Known features\n\n- No feature directories found yet.";
	}
	return `# Known features\n\n${features.map((feature) => `- ${feature}`).join("\n")}`;
}
