import { execFileSync } from "node:child_process";

export interface GitClient {
	getRepoRoot(cwd: string): string | null;
	getCurrentBranch(repoRoot: string): string | null;
	listBranches(repoRoot: string): string[];
	isDirty(repoRoot: string): boolean;
	createAndSwitchBranch(repoRoot: string, branchName: string): void;
}

function runGit(repoRoot: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

export function createGitClient(): GitClient {
	return {
		createAndSwitchBranch(repoRoot, branchName) {
			runGit(repoRoot, ["checkout", "-b", branchName]);
		},
		getCurrentBranch(repoRoot) {
			try {
				const branch = runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
				return branch || null;
			} catch {
				return null;
			}
		},
		getRepoRoot(cwd) {
			try {
				const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
					cwd,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "ignore"],
				}).trim();
				return root || null;
			} catch {
				return null;
			}
		},
		isDirty(repoRoot) {
			try {
				return runGit(repoRoot, ["status", "--short"]).length > 0;
			} catch {
				return false;
			}
		},
		listBranches(repoRoot) {
			try {
				const output = runGit(repoRoot, ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"]);
				return output
					.split(/\r?\n/)
					.map((line) => line.trim())
					.filter(Boolean)
					.map((line) => line.replace(/^[^/]+\//, ""));
			} catch {
				return [];
			}
		},
	};
}
