import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildWorkflowStatus, formatHelpReport, formatWorkflowStatus } from "../extension/status.js";
import { buildWorkflowPaths } from "../extension/workspace.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe("spec status helpers", () => {
	it("formats help output with colon-prefixed commands", () => {
		const help = formatHelpReport();
		expect(help).toContain("Use `/spec` or `/spec:<subcommand>` with one of these commands:");
		expect(help).toContain("`/spec:init`");
		expect(help).toContain("`/spec:constitution <principles>`");
		expect(help).toContain("`/spec:specify <feature description>`");
		expect(help).toContain("`/spec:clarify [focus]`");
		expect(help).toContain("`/spec:checklist [domain]`");
		expect(help).toContain("`/spec:plan <technical context>`");
		expect(help).toContain("`/spec:tasks [context]`");
		expect(help).toContain("`/spec:analyze [focus]`");
		expect(help).toContain("`/spec:implement [focus]`");
		expect(help).toContain("`/spec:status`");
		expect(help).toContain("`/spec:next`");
		expect(help).toContain("`/spec:list`");
		expect(help).toContain("Tip: `/spec:status` shows the current workflow status.");
	});

	it("reports colon-prefixed next steps through the workflow lifecycle", () => {
		const repoRoot = createTempDir("pi-spec-status");
		const uninitializedPaths = buildWorkflowPaths(repoRoot);
		const uninitialized = buildWorkflowStatus({
			currentBranch: "main",
			paths: uninitializedPaths,
			repoRoot,
		});
		expect(uninitialized.nextSteps).toStrictEqual([
			"/spec:init",
			"/spec:constitution <principles>",
			"/spec:specify <feature description>",
		]);

		mkdirSync(join(repoRoot, ".specify"), { recursive: true });
		const initializedWithoutFeature = buildWorkflowStatus({
			currentBranch: "main",
			paths: uninitializedPaths,
			repoRoot,
		});
		expect(initializedWithoutFeature.nextSteps).toStrictEqual(["/spec:specify <feature description>", "/spec:list"]);

		const featurePaths = buildWorkflowPaths(repoRoot, "001-auth-flow");
		mkdirSync(featurePaths.featureDir!, { recursive: true });
		writeFileSync(featurePaths.featureSpec!, "# Feature Specification\n", "utf8");
		const missingSpecPaths = buildWorkflowPaths(repoRoot, "002-missing-spec");
		mkdirSync(missingSpecPaths.featureDir!, { recursive: true });
		const missingSpec = buildWorkflowStatus({
			activeFeature: "002-missing-spec",
			currentBranch: "002-missing-spec",
			paths: missingSpecPaths,
			repoRoot,
		});
		expect(missingSpec.nextSteps).toStrictEqual(["/spec:specify <feature description>"]);

		const missingPlan = buildWorkflowStatus({
			activeFeature: "001-auth-flow",
			currentBranch: "001-auth-flow",
			paths: featurePaths,
			repoRoot,
		});
		expect(missingPlan.nextSteps).toStrictEqual([
			"/spec:clarify",
			"/spec:checklist quality",
			"/spec:plan <technical context>",
		]);

		writeFileSync(featurePaths.planFile!, "# Plan\n", "utf8");
		const missingTasks = buildWorkflowStatus({
			activeFeature: "001-auth-flow",
			currentBranch: "001-auth-flow",
			paths: featurePaths,
			repoRoot,
		});
		expect(missingTasks.nextSteps).toStrictEqual(["/spec:clarify", "/spec:checklist quality", "/spec:tasks"]);

		writeFileSync(featurePaths.tasksFile!, "# Tasks\n", "utf8");
		mkdirSync(featurePaths.checklistsDir!, { recursive: true });
		writeFileSync(join(featurePaths.checklistsDir!, "quality.md"), "- [ ] CHK001\n", "utf8");
		const incompleteChecklist = buildWorkflowStatus({
			activeFeature: "001-auth-flow",
			currentBranch: "001-auth-flow",
			paths: featurePaths,
			repoRoot,
		});
		expect(incompleteChecklist.nextSteps).toStrictEqual([
			"/spec:clarify",
			"/spec:checklist quality",
			"/spec:analyze",
			"/spec:implement (after checklist review)",
		]);

		writeFileSync(join(featurePaths.checklistsDir!, "quality.md"), "- [x] CHK001\n", "utf8");
		const completeChecklist = buildWorkflowStatus({
			activeFeature: "001-auth-flow",
			currentBranch: "001-auth-flow",
			paths: featurePaths,
			repoRoot,
		});
		expect(completeChecklist.nextSteps).toStrictEqual([
			"/spec:clarify",
			"/spec:checklist quality",
			"/spec:analyze",
			"/spec:implement",
		]);
		expect(formatWorkflowStatus(completeChecklist)).toContain("# /spec:status");
	});
});
