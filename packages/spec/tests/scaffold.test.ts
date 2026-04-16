import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureFeatureArtifacts, ensurePlanArtifact, ensureWorkflowScaffold } from "../extension/scaffold.js";
import { buildWorkflowPaths } from "../extension/workspace.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
	const dir = path.join(os.tmpdir(), `${prefix}-${Math.random().toString(36).slice(2, 8)}`);
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
	tempDirs.length = 0;
});

describe("workflow scaffold", () => {
	it("creates the native .specify workspace and memory files", async () => {
		const repoRoot = createTempDir("pi-spec-scaffold");
		await mkdir(repoRoot, { recursive: true });
		const paths = buildWorkflowPaths(repoRoot);

		const created = ensureWorkflowScaffold(paths);

		expect(created.length).toBeGreaterThan(0);
		expect(existsSync(paths.constitutionFile)).toBe(true);
		expect(existsSync(paths.agentContextFile)).toBe(true);
		expect(existsSync(path.join(paths.templatesDir, "commands", "specify.md"))).toBe(true);
		expect(readFileSync(paths.workflowReadmeFile, "utf8")).toContain("/spec:plan");
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
		expect(existsSync(featurePaths.checklistsDir!)).toBe(true);
		expect(existsSync(featurePaths.contractsDir!)).toBe(true);
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

		expect(created).toEqual([]);
		expect(after).toBe(before);
	});
});
