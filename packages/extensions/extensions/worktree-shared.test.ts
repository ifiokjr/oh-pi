import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	clearRepoWorktreeSnapshotCache,
	createManagedWorktree,
	createOwnerMetadata,
	getCachedRepoWorktreeContext,
	getCachedRepoWorktreeSnapshot,
	getRepoWorktreeContext,
	getRepoWorktreeSnapshot,
	loadWorktreeRegistry,
	refreshRepoWorktreeContext,
	refreshRepoWorktreeSnapshot,
	removeManagedWorktree,
	touchManagedWorktreeSeen,
} from "./worktree-shared";

const tempDirs: string[] = [];

function mkTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function run(command: string, args: string[], cwd: string): string {
	return execFileSync(command, args, {
		cwd,
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function initRepo(dir: string): void {
	run("git", ["init"], dir);
	run("git", ["config", "user.name", "Test Bot"], dir);
	run("git", ["config", "user.email", "test@example.com"], dir);
	fs.writeFileSync(path.join(dir, "README.md"), "# temp\n", "utf-8");
	run("git", ["add", "."], dir);
	run("git", ["commit", "-m", "init"], dir);
}

function real(value: string): string {
	try {
		return fs.realpathSync.native(value);
	} catch {
		return path.resolve(value);
	}
}

afterEach(() => {
	clearRepoWorktreeSnapshotCache();

	for (const dir of tempDirs.splice(0)) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore cleanup failures
		}
	}
});

describe("worktree-shared", () => {
	it("creates a Pai-owned worktree with owner + purpose metadata", () => {
		const repo = mkTempDir("pi-worktree-repo-");
		const sharedRoot = mkTempDir("pi-worktree-store-");
		initRepo(repo);

		const result = createManagedWorktree({
			cwd: repo,
			branch: "feat/footer-context",
			purpose: "Implement worktree-aware footer context",
			owner: createOwnerMetadata({
				instanceId: "pai-test-instance",
				cwd: repo,
				sessionFile: path.join(sharedRoot, "session.jsonl"),
				sessionName: "Worktree footer session",
			}),
			sharedRoot,
		});

		expect(result.worktreePath.startsWith(real(sharedRoot))).toBe(true);
		expect(fs.existsSync(result.worktreePath)).toBe(true);

		const snapshot = getRepoWorktreeSnapshot(result.worktreePath, sharedRoot);
		expect(snapshot?.repoRoot).toBe(real(repo));
		expect(snapshot?.isLinkedWorktree).toBe(true);
		expect(snapshot?.current?.isManaged).toBe(true);
		expect(snapshot?.current?.metadata?.purpose).toBe("Implement worktree-aware footer context");
		expect(snapshot?.current?.metadata?.owner.instanceId).toBe("pai-test-instance");
		expect(snapshot?.current?.metadata?.owner.sessionName).toBe("Worktree footer session");

		const context = getRepoWorktreeContext(result.worktreePath, sharedRoot);
		expect(context?.repoRoot).toBe(real(repo));
		expect(context?.current?.isManaged).toBe(true);
		expect(context?.current?.metadata?.purpose).toBe("Implement worktree-aware footer context");

		expect(touchManagedWorktreeSeen(repo, result.worktreePath, sharedRoot)).toBe(true);
		const firstRegistry = loadWorktreeRegistry(repo, sharedRoot);
		const firstSeenAt = firstRegistry.managedWorktrees[0]?.lastSeenAt ?? null;
		expect(firstRegistry.managedWorktrees).toHaveLength(1);
		expect(firstSeenAt).toBeTruthy();

		expect(touchManagedWorktreeSeen(repo, result.worktreePath, sharedRoot)).toBe(true);
		const secondRegistry = loadWorktreeRegistry(repo, sharedRoot);
		expect(secondRegistry.managedWorktrees[0]?.lastSeenAt ?? null).toBe(firstSeenAt);
	}, 30_000);

	it("warms async worktree context and snapshot caches without blocking callers", async () => {
		const repo = mkTempDir("pi-worktree-cache-repo-");
		const sharedRoot = mkTempDir("pi-worktree-cache-store-");
		initRepo(repo);

		expect(getCachedRepoWorktreeContext(repo, sharedRoot)).toBeNull();
		expect(getCachedRepoWorktreeSnapshot(repo, sharedRoot)).toBeNull();

		const context = await refreshRepoWorktreeContext(repo, sharedRoot);
		expect(context?.repoRoot).toBe(real(repo));
		expect(getCachedRepoWorktreeContext(repo, sharedRoot)?.repoRoot).toBe(real(repo));

		const snapshot = await refreshRepoWorktreeSnapshot(repo, sharedRoot);
		expect(snapshot?.repoRoot).toBe(real(repo));
		expect(getCachedRepoWorktreeSnapshot(repo, sharedRoot)?.repoRoot).toBe(real(repo));
	}, 30_000);

	it("removes only the targeted Pai-owned worktree and leaves external ones alone", () => {
		const repo = mkTempDir("pi-worktree-cleanup-repo-");
		const sharedRoot = mkTempDir("pi-worktree-cleanup-store-");
		const externalParent = mkTempDir("pi-worktree-external-");
		const externalWorktreePath = path.join(externalParent, "manual-worktree");
		initRepo(repo);

		const managed = createManagedWorktree({
			cwd: repo,
			branch: "feat/pai-owned",
			purpose: "Tracked by Pai for cleanup",
			owner: createOwnerMetadata({ instanceId: "pai-cleanup", cwd: repo }),
			sharedRoot,
		});
		run("git", ["worktree", "add", "-b", "feat/manual", externalWorktreePath, "HEAD"], repo);

		const before = getRepoWorktreeSnapshot(repo, sharedRoot);
		expect(before?.worktrees.some((entry) => entry.path === managed.worktreePath && entry.isManaged)).toBe(true);
		expect(before?.worktrees.some((entry) => entry.path === real(externalWorktreePath) && !entry.isManaged)).toBe(true);

		const removed = removeManagedWorktree(managed.metadata, sharedRoot);
		expect(removed.removed).toBe(true);

		const after = getRepoWorktreeSnapshot(repo, sharedRoot);
		expect(after?.worktrees.some((entry) => entry.path === managed.worktreePath)).toBe(false);
		expect(after?.worktrees.some((entry) => entry.path === real(externalWorktreePath) && !entry.isManaged)).toBe(true);
		expect(loadWorktreeRegistry(repo, sharedRoot).managedWorktrees).toHaveLength(0);
	}, 30_000);
});
