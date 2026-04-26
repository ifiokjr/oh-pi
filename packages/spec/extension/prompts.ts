import type { WorkflowPromptContext } from "./types.js";

function formatChecklistBlock(checklists: WorkflowPromptContext["checklists"]): string[] {
	if (!checklists || checklists.length === 0) {
		return ["- No checklist files found."];
	}
	return checklists.map((checklist) => {
		const status = checklist.incomplete === 0 ? "PASS" : "FAIL";
		return `- ${checklist.name}: ${status} (${checklist.completed}/${checklist.total} complete, ${checklist.incomplete} incomplete) — ${checklist.path}`;
	});
}

export function buildWorkflowPrompt(context: WorkflowPromptContext): string {
	const lines = [
		`You are executing the native /spec ${context.step} workflow inside pi.`,
		"",
		"## Native runtime notes",
		"- Do NOT run any shell or PowerShell scripts referenced by the workflow template.",
		"- Do NOT rely on the external spec-kit CLI. This pi extension has already prepared the local workspace and resolved the relevant paths.",
		"- Treat any `/speckit.<name>` references in the workflow template as the equivalent `/spec <name>` step.",
		"- Use pi's built-in tools directly to read, edit, write, grep, find, and run validation commands.",
		"- Use `.specify/memory/pi-agent.md` as the native pi replacement for agent-specific context files or update-agent-context scripts.",
		"",
		"## Prepared workspace",
		`- Repository root: ${context.paths.repoRoot}`,
		`- Current branch: ${context.currentBranch}`,
		`- Workflow template to follow: ${context.workflowTemplatePath}`,
		`- Workflow README: ${context.paths.workflowReadmeFile}`,
		`- Template directory: ${context.paths.templatesDir}`,
		`- Constitution file: ${context.paths.constitutionFile}`,
		`- Pi agent context file: ${context.paths.agentContextFile}`,
		`- Extensions config: ${context.paths.extensionsConfigFile}`,
	];

	if (context.paths.featureBranch) {
		lines.push(`- Active feature branch/name: ${context.paths.featureBranch}`);
	}

	if (context.paths.featureDir) {
		lines.push(`- Feature directory: ${context.paths.featureDir}`);
	}

	if (context.paths.featureSpec) {
		lines.push(`- Feature spec: ${context.paths.featureSpec}`);
	}

	if (context.paths.planFile) {
		lines.push(`- Implementation plan: ${context.paths.planFile}`);
	}

	if (context.paths.tasksFile) {
		lines.push(`- Task list: ${context.paths.tasksFile}`);
	}

	if (context.paths.researchFile) {
		lines.push(`- Research file: ${context.paths.researchFile}`);
	}

	if (context.paths.dataModelFile) {
		lines.push(`- Data model: ${context.paths.dataModelFile}`);
	}

	if (context.paths.quickstartFile) {
		lines.push(`- Quickstart: ${context.paths.quickstartFile}`);
	}

	if (context.paths.contractsDir) {
		lines.push(`- Contracts directory: ${context.paths.contractsDir}`);
	}

	if (context.paths.checklistsDir) {
		lines.push(`- Checklists directory: ${context.paths.checklistsDir}`);
	}

	if (context.stepNotes.length > 0) {
		lines.push("", "## Step-specific notes", ...context.stepNotes.map((note) => `- ${note}`));
	}

	if (context.step === "implement") {
		lines.push("", "## Checklist status", ...formatChecklistBlock(context.checklists));
	}

	lines.push(
		"",
		"## User input from the slash command",
		context.input.trim() || "(none)",
		"",
		"## Execution instructions",
		"1. Read the workflow template path listed above before making changes.",
		"2. Substitute the prepared paths above anywhere the original template expects script output variables.",
		"3. If the template references optional hooks in `.specify/extensions.yml`, inspect that file manually instead of expecting automatic shell execution.",
		"4. Perform the work directly in this repository using pi tools and then summarize what changed, what remains, and the next recommended `/spec` command.",
	);

	return lines.join("\n");
}

export function getStepNotes(step: WorkflowPromptContext["step"]): string[] {
	switch (step) {
		case "constitution": {
			return [
				"Keep the constitution in `.specify/memory/constitution.md` as the canonical governance file.",
				"When propagating changes, prefer updating `.specify/templates/*` and `.specify/memory/pi-agent.md` over agent-specific script outputs.",
			];
		}
		case "specify": {
			return [
				"The native /spec runtime has already generated the feature number, branch name, feature directory, and spec scaffold.",
				"Do not create a second feature branch or rerun any feature-creation shell scripts.",
			];
		}
		case "clarify": {
			return [
				"Ask at most five high-impact clarification questions and update the spec incrementally after each accepted answer.",
			];
		}
		case "checklist": {
			return ["Generate checklist items that test requirement quality, not implementation behavior."];
		}
		case "plan": {
			return [
				"The native /spec runtime has already scaffolded `plan.md` if it was missing.",
				"Use `.specify/memory/pi-agent.md` as the pi-native output in place of agent-specific update scripts.",
			];
		}
		case "tasks": {
			return [
				"Organize tasks by independently testable user stories and preserve the strict checkbox format from the template.",
			];
		}
		case "analyze": {
			return ["Keep the analysis strictly read-only; do not edit files during this step."];
		}
		case "implement": {
			return [
				"Mark completed tasks as `[x]` in tasks.md as you implement them.",
				"If checklists are incomplete, respect the user's decision about whether to proceed.",
			];
		}
	}
}
