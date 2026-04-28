import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildPaiInstanceId,
	clearRepoWorktreeSnapshotCache,
	createManagedWorktree,
	createOwnerMetadata,
	formatOwnerLabel,
	formatWorktreeKind,
	getCachedRepoWorktreeContext,
	getCachedRepoWorktreeSnapshot,
	getManagedWorktreeParentDir,
	getRepoWorktreeContext,
	getRepoWorktreeSnapshot,
	getWorktreeRegistryPath,
	loadWorktreeRegistry,
	refreshRepoWorktreeContext,
	refreshRepoWorktreeSnapshot,
	removeManagedWorktree,
	touchManagedWorktreeSeen,
} from "./worktree.js";

function git(cwd: string, args: string[]): string {
	return execFileSync("git", ["-C", cwd, ...args], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function createTempRepo(rootDir: string): string {
	const repoDir = path.join(rootDir, "repo");
	fs.mkdirSync(repoDir, { recursive: true });
	git(repoDir, ["init", "--initial-branch", "main"]);
	git(repoDir, ["config", "user.name", "Coverage Bot"]);
	git(repoDir, ["config", "user.email", "coverage@example.com"]);
	fs.writeFileSync(path.join(repoDir, "README.md"), "# repo\n", "utf-8");
	git(repoDir, ["add", "README.md"]);
	git(repoDir, ["commit", "-m", "chore: seed repo"]);
	return repoDir;
}

const tempRoots: string[] = [];

function createSandbox() {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oh-pi-worktree-test-"));
	tempRoots.push(tempRoot);
	return {
		tempRoot,
		repoDir: createTempRepo(tempRoot),
		sharedRoot: path.join(tempRoot, "shared-worktrees"),
	};
}

afterEach(() => {
	clearRepoWorktreeSnapshotCache();
	for (const tempRoot of tempRoots.splice(0)) {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

describe("worktree helpers", () => {
	it("creates owner metadata and labels consistently", () => {
		const owner = createOwnerMetadata({
			instanceId: "pai-test-instance",
			cwd: "/tmp/repo",
			sessionFile: "/tmp/repo/.pi/session-123.jsonl",
			sessionName: "Coverage run",
		});

		expect(owner.createdFromCwd).toBe(path.resolve("/tmp/repo"));
		expect(owner.sessionFile).toBe(path.resolve("/tmp/repo/.pi/session-123.jsonl"));
		expect(owner.sessionId).toBe("session-123");
		expect(owner.sessionName).toBe("Coverage run");
		expect(formatOwnerLabel(owner)).toBe("pai-test-instance (Coverage run)");
		expect(formatOwnerLabel({ ...owner, sessionName: null })).toBe("pai-test-instance (session-123)");
		expect(formatWorktreeKind({ isMain: true, isManaged: false })).toBe("main");
		expect(formatWorktreeKind({ isMain: false, isManaged: true })).toBe("pi-owned");
		expect(formatWorktreeKind({ isMain: false, isManaged: false })).toBe("external");
		expect(buildPaiInstanceId(1234)).toMatch(/^pai-[a-z0-9._-]+-\d+-ya$/);
	});

	it("returns null outside a git repository and validates required fields", () => {
		const { tempRoot } = createSandbox();
		expect(getRepoWorktreeSnapshot(tempRoot)).toBeNull();

		const owner = createOwnerMetadata({ instanceId: "pai-1", cwd: tempRoot });
		expect(() =>
			createManagedWorktree({
				cwd: tempRoot,
				branch: "",
				purpose: "Coverage",
				owner,
				sharedRoot: tempRoot,
			}),
		).toThrow("Branch name is required.");
		expect(() =>
			createManagedWorktree({
				cwd: tempRoot,
				branch: "test/coverage",
				purpose: "",
				owner,
				sharedRoot: tempRoot,
			}),
		).toThrow("Purpose is required.");
	});

	it("creates managed worktrees, snapshots them, and persists registry metadata", () => {
		const { repoDir, sharedRoot } = createSandbox();
		const normalizedRepoDir = fs.realpathSync.native(repoDir);
		const owner = createOwnerMetadata({
			instanceId: "pai-1",
			cwd: repoDir,
			sessionFile: path.join(repoDir, ".pi", "session-1.jsonl"),
			sessionName: "Coverage run",
		});

		const initialSnapshot = getRepoWorktreeSnapshot(repoDir, sharedRoot);
		expect(initialSnapshot?.repoRoot).toBe(normalizedRepoDir);
		expect(initialSnapshot?.isLinkedWorktree).toBe(false);
		expect(initialSnapshot?.worktrees).toHaveLength(1);
		expect(initialSnapshot?.registry.managedWorktrees).toEqual([]);

		const result = createManagedWorktree({
			cwd: repoDir,
			branch: "test/worktree-coverage",
			purpose: "Cover git worktree flows",
			owner,
			sharedRoot,
		});

		expect(result.createdBranch).toBe(true);
		expect(result.branch).toBe("test/worktree-coverage");
		expect(fs.existsSync(result.worktreePath)).toBe(true);
		expect(result.worktreePath.startsWith(getManagedWorktreeParentDir(normalizedRepoDir, sharedRoot))).toBe(true);
		expect(fs.existsSync(getWorktreeRegistryPath(normalizedRepoDir, sharedRoot))).toBe(true);

		const linkedSnapshot = getRepoWorktreeSnapshot(result.worktreePath, sharedRoot);
		expect(linkedSnapshot?.isLinkedWorktree).toBe(true);
		expect(linkedSnapshot?.currentBranch).toBe("test/worktree-coverage");
		expect(linkedSnapshot?.current?.isManaged).toBe(true);
		expect(linkedSnapshot?.current?.metadata?.purpose).toBe("Cover git worktree flows");
		expect(linkedSnapshot?.worktrees).toHaveLength(2);

		expect(touchManagedWorktreeSeen(normalizedRepoDir, result.worktreePath, sharedRoot)).toBe(true);
		expect(touchManagedWorktreeSeen(normalizedRepoDir, path.join(sharedRoot, "missing"), sharedRoot)).toBe(false);

		const registry = loadWorktreeRegistry(normalizedRepoDir, sharedRoot);
		expect(registry.managedWorktrees).toHaveLength(1);
		expect(registry.managedWorktrees[0]).toMatchObject({
			branch: "test/worktree-coverage",
			purpose: "Cover git worktree flows",
			owner: { instanceId: "pai-1", sessionName: "Coverage run" },
		});
		expect(registry.managedWorktrees[0]?.lastSeenAt).toEqual(expect.any(String));

		const removal = removeManagedWorktree(result.metadata, sharedRoot);
		expect(removal).toMatchObject({
			removed: true,
			removedFromGit: true,
			removedRegistryEntry: true,
			note: "Removed pi-owned worktree from git worktree list.",
		});
		expect(fs.existsSync(result.worktreePath)).toBe(false);
		expect(loadWorktreeRegistry(normalizedRepoDir, sharedRoot).managedWorktrees).toEqual([]);
	}, 20_000);

	it("reads lightweight context probe without git worktree list", () => {
		const { repoDir, sharedRoot } = createSandbox();
		const normalizedRepoDir = fs.realpathSync.native(repoDir);

		const context = getRepoWorktreeContext(repoDir, sharedRoot);
		expect(context).not.toBeNull();
		expect(context!.repoRoot).toBe(normalizedRepoDir);
		expect(context!.isLinkedWorktree).toBe(false);
		expect(context!.currentBranch).toBe("main");
		expect(context!.current?.isMain).toBe(true);
		// Context does not include the worktrees array
		expect((context as any).worktrees).toBeUndefined();
	}, 10_000);

	it("caches context and snapshot probes", () => {
		const { repoDir, sharedRoot } = createSandbox();

		expect(getCachedRepoWorktreeContext(repoDir, sharedRoot)).toBeNull();
		expect(getCachedRepoWorktreeSnapshot(repoDir, sharedRoot)).toBeNull();

		getRepoWorktreeContext(repoDir, sharedRoot);
		expect(getCachedRepoWorktreeContext(repoDir, sharedRoot)).not.toBeNull();

		getRepoWorktreeSnapshot(repoDir, sharedRoot);
		expect(getCachedRepoWorktreeSnapshot(repoDir, sharedRoot)).not.toBeNull();

		clearRepoWorktreeSnapshotCache();
		expect(getCachedRepoWorktreeContext(repoDir, sharedRoot)).toBeNull();
		expect(getCachedRepoWorktreeSnapshot(repoDir, sharedRoot)).toBeNull();
	}, 10_000);

	it("refreshes context and snapshot async without blocking", async () => {
		const { repoDir, sharedRoot } = createSandbox();
		const normalizedRepoDir = fs.realpathSync.native(repoDir);

		expect(getCachedRepoWorktreeContext(repoDir, sharedRoot)).toBeNull();
		expect(getCachedRepoWorktreeSnapshot(repoDir, sharedRoot)).toBeNull();

		const context = await refreshRepoWorktreeContext(repoDir, sharedRoot);
		expect(context?.repoRoot).toBe(normalizedRepoDir);
		expect(getCachedRepoWorktreeContext(repoDir, sharedRoot)?.repoRoot).toBe(normalizedRepoDir);

		const snapshot = await refreshRepoWorktreeSnapshot(repoDir, sharedRoot);
		expect(snapshot?.repoRoot).toBe(normalizedRepoDir);
		expect(getCachedRepoWorktreeSnapshot(repoDir, sharedRoot)?.repoRoot).toBe(normalizedRepoDir);
	}, 10_000);

	it("removes stale registry entries when the worktree is already gone", () => {
		const { repoDir, sharedRoot } = createSandbox();
		const normalizedRepoDir = fs.realpathSync.native(repoDir);
		const owner = createOwnerMetadata({ instanceId: "pai-1", cwd: repoDir });
		const result = createManagedWorktree({
			cwd: repoDir,
			branch: "test/stale-worktree",
			purpose: "Exercise stale cleanup",
			owner,
			sharedRoot,
		});

		git(repoDir, ["worktree", "remove", "--force", result.worktreePath]);

		const snapshot = getRepoWorktreeSnapshot(normalizedRepoDir, sharedRoot);
		expect(snapshot?.staleManagedWorktrees).toHaveLength(1);
		expect(snapshot?.staleManagedWorktrees[0]?.worktreePath).toBe(result.worktreePath);

		const removal = removeManagedWorktree(result.metadata, sharedRoot);
		expect(removal).toMatchObject({
			removed: true,
			removedFromGit: false,
			removedRegistryEntry: true,
			note: "Worktree directory was already missing; removed stale pi registry entry.",
		});
		expect(loadWorktreeRegistry(normalizedRepoDir, sharedRoot).managedWorktrees).toEqual([]);
	}, 20_000);
});
