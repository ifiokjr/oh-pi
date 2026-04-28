import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GitClient } from "../extension/git.js";
import {
	buildWorkflowPaths,
	cleanBranchSegment,
	computeNextFeatureNumber,
	extractFeatureNumber,
	findRepoRoot,
	generateBranchShortName,
	listFeatureDirs,
	resolveFeatureFromBranch,
	truncateBranchName,
} from "../extension/workspace.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
	const dir = path.join(os.tmpdir(), `${prefix}-${Math.random().toString(36).slice(2, 8)}`);
	mkdirSync(dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

function createGitMock(overrides: Partial<GitClient> = {}): GitClient {
	return {
		getRepoRoot: () => null,
		getCurrentBranch: () => null,
		listBranches: () => [],
		isDirty: () => false,
		createAndSwitchBranch: () => undefined,
		...overrides,
	};
}

afterEach(async () => {
	const { rm } = await import("node:fs/promises");
	await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
	tempDirs.length = 0;
});

describe("workspace helpers", () => {
	it("generates a concise branch short name", () => {
		expect(generateBranchShortName("Implement OAuth2 integration for the API")).toContain("oauth2");
		expect(generateBranchShortName("Add a dashboard for analytics")).toBe("dashboard-analytics");
	});

	it("cleans arbitrary branch segments", () => {
		expect(cleanBranchSegment("  Add User Auth!  ")).toBe("add-user-auth");
	});

	it("truncates overlong branch names to GitHub-safe length", () => {
		const input = `001-${"very-long-".repeat(40)}`;
		const result = truncateBranchName(input);
		expect(result.length).toBeLessThanOrEqual(244);
		expect(result.startsWith("001-")).toBe(true);
	});

	it("lists numbered feature directories and resolves them from the current branch", () => {
		const repoRoot = createTempDir("pi-spec-workspace");
		mkdirSync(path.join(repoRoot, "specs", "001-auth-flow"), {
			recursive: true,
		});
		mkdirSync(path.join(repoRoot, "specs", "002-billing-reports"), {
			recursive: true,
		});
		mkdirSync(path.join(repoRoot, "specs", "misc-not-a-feature"), {
			recursive: true,
		});

		expect(listFeatureDirs(repoRoot)).toEqual(["001-auth-flow", "002-billing-reports"]);
		expect(resolveFeatureFromBranch(repoRoot, "002-any-branch-name")).toBe("002-billing-reports");
	});

	it("computes the next feature number from both specs and git branches", () => {
		const repoRoot = createTempDir("pi-spec-next-feature");
		mkdirSync(path.join(repoRoot, "specs", "002-billing-reports"), {
			recursive: true,
		});
		mkdirSync(path.join(repoRoot, "specs", "005-data-import"), {
			recursive: true,
		});

		expect(computeNextFeatureNumber(repoRoot, ["003-something", "origin/006-another"])).toBe(7);
	});

	it("finds the repo root from git first, then .specify fallback", () => {
		const repoRoot = createTempDir("pi-spec-root");
		mkdirSync(path.join(repoRoot, ".specify"), { recursive: true });
		const nested = path.join(repoRoot, "packages", "feature");
		mkdirSync(nested, { recursive: true });

		expect(findRepoRoot(nested, createGitMock()).repoRoot).toBe(repoRoot);

		const gitRoot = createTempDir("pi-spec-git-root");
		const gitNested = path.join(gitRoot, "nested");
		mkdirSync(gitNested, { recursive: true });
		const result = findRepoRoot(gitNested, createGitMock({ getRepoRoot: () => gitRoot }));
		expect(result).toEqual({ repoRoot: gitRoot, hasGit: true });
	});

	it("builds workflow paths for an active feature", () => {
		const repoRoot = "/repo";
		const paths = buildWorkflowPaths(repoRoot, "007-native-spec");
		expect(paths.featureSpec).toBe("/repo/specs/007-native-spec/spec.md");
		expect(paths.planFile).toBe("/repo/specs/007-native-spec/plan.md");
		expect(paths.constitutionFile).toBe("/repo/.specify/memory/constitution.md");
	});

	it("extracts feature numbers from numbered names", () => {
		expect(extractFeatureNumber("007-native-spec")).toBe(7);
		expect(extractFeatureNumber("main")).toBeNull();
	});
});
