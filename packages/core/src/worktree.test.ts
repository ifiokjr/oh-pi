import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function createTempRepo(rootDir: string): string {
	const repoDir = path.join(rootDir, "repo");
	fs.mkdirSync(repoDir, { recursive: true });
	git(repoDir, ["init", "--initial-branch", "main"]);
	git(repoDir, ["config", "user.name", "Coverage Bot"]);
	git(repoDir, ["config", "user.email", "coverage@example.com"]);
	fs.writeFileSync(path.join(repoDir, "README.md"), "# repo\n", "utf8");
	git(repoDir, ["add", "README.md"]);
	git(repoDir, ["commit", "-m", "chore: seed repo"]);
	return repoDir;
}

const tempRoots: string[] = [];

function createSandbox() {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oh-pi-worktree-test-"));
	tempRoots.push(tempRoot);
	return {
		repoDir: createTempRepo(tempRoot),
		sharedRoot: path.join(tempRoot, "shared-worktrees"),
		tempRoot,
	};
}

afterEach(() => {
	clearRepoWorktreeSnapshotCache();
	for (const tempRoot of tempRoots.splice(0)) {
		fs.rmSync(tempRoot, { force: true, recursive: true });
	}
});

describe("worktree helpers", () => {
	it("creates owner metadata and labels consistently", () => {
		const owner = createOwnerMetadata({
			cwd: "/tmp/repo",
			instanceId: "pai-test-instance",
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

		const owner = createOwnerMetadata({ cwd: tempRoot, instanceId: "pai-1" });
		expect(() =>
			createManagedWorktree({ branch: "", cwd: tempRoot, owner, purpose: "Coverage", sharedRoot: tempRoot }),
		).toThrow("Branch name is required.");
		expect(() =>
			createManagedWorktree({ branch: "test/coverage", cwd: tempRoot, owner, purpose: "", sharedRoot: tempRoot }),
		).toThrow("Purpose is required.");
	});

	it("creates managed worktrees, snapshots them, and persists registry metadata", () => {
		const { repoDir, sharedRoot } = createSandbox();
		const normalizedRepoDir = fs.realpathSync.native(repoDir);
		const owner = createOwnerMetadata({
			cwd: repoDir,
			instanceId: "pai-1",
			sessionFile: path.join(repoDir, ".pi", "session-1.jsonl"),
			sessionName: "Coverage run",
		});

		const initialSnapshot = getRepoWorktreeSnapshot(repoDir, sharedRoot);
		expect(initialSnapshot?.repoRoot).toBe(normalizedRepoDir);
		expect(initialSnapshot?.isLinkedWorktree).toBeFalsy();
		expect(initialSnapshot?.worktrees).toHaveLength(1);
		expect(initialSnapshot?.registry.managedWorktrees).toStrictEqual([]);

		const result = createManagedWorktree({
			branch: "test/worktree-coverage",
			cwd: repoDir,
			owner,
			purpose: "Cover git worktree flows",
			sharedRoot,
		});

		expect(result.createdBranch).toBeTruthy();
		expect(result.branch).toBe("test/worktree-coverage");
		expect(fs.existsSync(result.worktreePath)).toBeTruthy();
		expect(result.worktreePath.startsWith(getManagedWorktreeParentDir(normalizedRepoDir, sharedRoot))).toBeTruthy();
		expect(fs.existsSync(getWorktreeRegistryPath(normalizedRepoDir, sharedRoot))).toBeTruthy();

		const linkedSnapshot = getRepoWorktreeSnapshot(result.worktreePath, sharedRoot);
		expect(linkedSnapshot?.isLinkedWorktree).toBeTruthy();
		expect(linkedSnapshot?.currentBranch).toBe("test/worktree-coverage");
		expect(linkedSnapshot?.current?.isManaged).toBeTruthy();
		expect(linkedSnapshot?.current?.metadata?.purpose).toBe("Cover git worktree flows");
		expect(linkedSnapshot?.worktrees).toHaveLength(2);

		expect(touchManagedWorktreeSeen(normalizedRepoDir, result.worktreePath, sharedRoot)).toBeTruthy();
		expect(touchManagedWorktreeSeen(normalizedRepoDir, path.join(sharedRoot, "missing"), sharedRoot)).toBeFalsy();

		const registry = loadWorktreeRegistry(normalizedRepoDir, sharedRoot);
		expect(registry.managedWorktrees).toHaveLength(1);
		expect(registry.managedWorktrees[0]).toMatchObject({
			branch: "test/worktree-coverage",
			owner: { instanceId: "pai-1", sessionName: "Coverage run" },
			purpose: "Cover git worktree flows",
		});
		expect(registry.managedWorktrees[0]?.lastSeenAt).toStrictEqual(expect.any(String));

		const removal = removeManagedWorktree(result.metadata, sharedRoot);
		expect(removal).toMatchObject({
			note: "Removed pi-owned worktree from git worktree list.",
			removed: true,
			removedFromGit: true,
			removedRegistryEntry: true,
		});
		expect(fs.existsSync(result.worktreePath)).toBeFalsy();
		expect(loadWorktreeRegistry(normalizedRepoDir, sharedRoot).managedWorktrees).toStrictEqual([]);
	}, 20_000);

	it("reads lightweight context probe without git worktree list", () => {
		const { repoDir, sharedRoot } = createSandbox();
		const normalizedRepoDir = fs.realpathSync.native(repoDir);

		const context = getRepoWorktreeContext(repoDir, sharedRoot);
		expect(context).not.toBeNull();
		expect(context!.repoRoot).toBe(normalizedRepoDir);
		expect(context!.isLinkedWorktree).toBeFalsy();
		expect(context!.currentBranch).toBe("main");
		expect(context!.current?.isMain).toBeTruthy();
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
		const owner = createOwnerMetadata({ cwd: repoDir, instanceId: "pai-1" });
		const result = createManagedWorktree({
			branch: "test/stale-worktree",
			cwd: repoDir,
			owner,
			purpose: "Exercise stale cleanup",
			sharedRoot,
		});

		git(repoDir, ["worktree", "remove", "--force", result.worktreePath]);

		const snapshot = getRepoWorktreeSnapshot(normalizedRepoDir, sharedRoot);
		expect(snapshot?.staleManagedWorktrees).toHaveLength(1);
		expect(snapshot?.staleManagedWorktrees[0]?.worktreePath).toBe(result.worktreePath);

		const removal = removeManagedWorktree(result.metadata, sharedRoot);
		expect(removal).toMatchObject({
			note: "Worktree directory was already missing; removed stale pi registry entry.",
			removed: true,
			removedFromGit: false,
			removedRegistryEntry: true,
		});
		expect(loadWorktreeRegistry(normalizedRepoDir, sharedRoot).managedWorktrees).toStrictEqual([]);
	}, 20_000);
});
