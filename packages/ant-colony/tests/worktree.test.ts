import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareColonyWorkspace, resumeColonyWorkspace } from "../extensions/ant-colony/worktree.js";
import { getManagedWorktreeParentDir } from "../extensions/ant-colony/worktree-registry.js";

function sharedStorageOptions() {
	return { mode: "shared" as const, sharedRoot: mkTempDir("colony-storage-") };
}

const tmpDirs: string[] = [];

function mkTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

function initRepo(dir: string): void {
	execFileSync("git", ["-C", dir, "init"], { stdio: "pipe" });
	execFileSync("git", ["-C", dir, "config", "user.name", "Test Bot"], { stdio: "pipe" });
	execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"], { stdio: "pipe" });
	fs.writeFileSync(path.join(dir, "README.md"), "# temp\n", "utf-8");
	execFileSync("git", ["-C", dir, "add", "."], { stdio: "pipe" });
	execFileSync("git", ["-C", dir, "commit", "-m", "init"], { stdio: "pipe" });
}

afterEach(() => {
	for (const dir of tmpDirs.splice(0)) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

describe("worktree workspace isolation", () => {
	it("falls back to shared workspace outside git repos", () => {
		const cwd = mkTempDir("colony-no-git-");
		const workspace = prepareColonyWorkspace({ cwd, runtimeId: "c1", storageOptions: sharedStorageOptions() });

		expect(workspace.mode).toBe("shared");
		expect(workspace.executionCwd).toBe(cwd);
		expect(workspace.note).toContain("shared");
	});

	it("creates a pi-owned isolated git worktree by default", () => {
		const repo = mkTempDir("colony-worktree-");
		const storageOptions = sharedStorageOptions();
		initRepo(repo);

		const workspace = prepareColonyWorkspace({
			cwd: repo,
			runtimeId: "c2",
			goal: "Implement footer polish",
			storageOptions,
		});
		expect(workspace.mode).toBe("worktree");
		expect(workspace.worktreeRoot).toBeTruthy();
		expect(workspace.executionCwd).not.toBe(repo);
		expect(fs.existsSync(workspace.executionCwd)).toBe(true);
		expect(workspace.worktreeRoot?.startsWith(getManagedWorktreeParentDir(repo))).toBe(true);
		expect(workspace.managedByPi).toBe(true);
		expect(workspace.purpose).toContain("Implement footer polish");

		const branch = execFileSync("git", ["-C", workspace.executionCwd, "rev-parse", "--abbrev-ref", "HEAD"], {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		expect(branch).toBe(workspace.branch);
	});

	it("reuses saved worktree metadata on resume", () => {
		const repo = mkTempDir("colony-resume-worktree-");
		const storageOptions = sharedStorageOptions();
		initRepo(repo);

		const initial = prepareColonyWorkspace({ cwd: repo, runtimeId: "c3", goal: "Resume worktree", storageOptions });
		expect(initial.mode).toBe("worktree");

		const resumed = resumeColonyWorkspace({ cwd: repo, runtimeId: "c4", savedWorkspace: initial, storageOptions });
		expect(resumed.mode).toBe("worktree");
		expect(resumed.executionCwd).toBe(initial.executionCwd);
	});
});
