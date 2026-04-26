import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ensureFeatureArtifacts, ensurePlanArtifact, ensureWorkflowScaffold } from "../extension/scaffold.js";
import { buildWorkflowPaths } from "../extension/workspace.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
	const dir = path.join(os.tmpdir(), `${prefix}-${Math.random().toString(36).slice(2, 8)}`);
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
	tempDirs.length = 0;
});

describe("workflow scaffold", () => {
	it("creates the native .specify workspace and memory files", async () => {
		const repoRoot = createTempDir("pi-spec-scaffold");
		await mkdir(repoRoot, { recursive: true });
		const paths = buildWorkflowPaths(repoRoot);

		const created = ensureWorkflowScaffold(paths);

		expect(created.length).toBeGreaterThan(0);
		expect(existsSync(paths.constitutionFile)).toBeTruthy();
		expect(existsSync(paths.agentContextFile)).toBeTruthy();
		expect(existsSync(path.join(paths.templatesDir, "commands", "specify.md"))).toBeTruthy();
		const workflowReadme = readFileSync(paths.workflowReadmeFile, "utf8");
		expect(workflowReadme).toContain("/spec:init");
		expect(workflowReadme).toContain("/spec:constitution <principles>");
		expect(workflowReadme).toContain("/spec:specify <feature description>");
		expect(workflowReadme).toContain("/spec:clarify [focus]");
		expect(workflowReadme).toContain("/spec:checklist [domain]");
		expect(workflowReadme).toContain("/spec:plan <technical context>");
		expect(workflowReadme).toContain("/spec:tasks [context]");
		expect(workflowReadme).toContain("/spec:analyze [focus]");
		expect(workflowReadme).toContain("/spec:implement [focus]");
		expect(workflowReadme).toContain("/spec:status");
		expect(workflowReadme).toContain("/spec:next");
		expect(readFileSync(paths.extensionsConfigFile, "utf8")).toContain("auto_execute_hooks");
	});

	it("scaffolds spec.md, plan.md, and contracts for an active feature", async () => {
		const repoRoot = createTempDir("pi-spec-feature");
		await mkdir(repoRoot, { recursive: true });
		const basePaths = buildWorkflowPaths(repoRoot);
		ensureWorkflowScaffold(basePaths);
		const featurePaths = buildWorkflowPaths(repoRoot, "001-auth-flow");

		const createdSpec = ensureFeatureArtifacts(featurePaths);
		const createdPlan = ensurePlanArtifact(featurePaths);

		expect(createdSpec).toContain(featurePaths.featureSpec);
		expect(createdPlan).toContain(featurePaths.planFile);
		expect(existsSync(featurePaths.checklistsDir!)).toBeTruthy();
		expect(existsSync(featurePaths.contractsDir!)).toBeTruthy();
		expect(readFileSync(featurePaths.featureSpec!, "utf8")).toContain("Feature Specification");
		expect(readFileSync(featurePaths.planFile!, "utf8")).toContain("Implementation Plan");
	});

	it("preserves existing files on repeated initialization", async () => {
		const repoRoot = createTempDir("pi-spec-preserve");
		await mkdir(repoRoot, { recursive: true });
		const paths = buildWorkflowPaths(repoRoot);
		ensureWorkflowScaffold(paths);
		const before = readFileSync(paths.constitutionFile, "utf8");

		const created = ensureWorkflowScaffold(paths);
		const after = readFileSync(paths.constitutionFile, "utf8");

		expect(created).toStrictEqual([]);
		expect(after).toBe(before);
	});
});
