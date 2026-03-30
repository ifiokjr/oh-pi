import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { type ColonyStorageOptions, getColonyWorktreeParentDir, resolveColonyStorageOptions } from "./storage.js";
import type { ColonyWorkspace } from "./types.js";

const WORKTREE_ENV_FLAG = "PI_ANT_COLONY_WORKTREE";

export interface PrepareColonyWorkspaceOptions {
	cwd: string;
	runtimeId: string;
	enabled?: boolean;
	storageOptions?: ColonyStorageOptions;
}

export interface ResumeColonyWorkspaceOptions extends PrepareColonyWorkspaceOptions {
	savedWorkspace?: ColonyWorkspace | null;
}

const DISABLED_VALUES = new Set(["0", "false", "off", "no"]);

function git(cwd: string, args: string[]): string {
	return execFileSync("git", ["-C", cwd, ...args], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function sanitizeSegment(value: string): string {
	const cleaned = value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return cleaned || "colony";
}

function randomSuffix(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function fallbackWorkspace(originCwd: string, note: string): ColonyWorkspace {
	return {
		mode: "shared",
		originCwd,
		executionCwd: originCwd,
		repoRoot: null,
		worktreeRoot: null,
		branch: null,
		baseBranch: null,
		note,
	};
}

function resolveExecutionCwd(worktreeRoot: string, repoRoot: string, originCwd: string): string {
	const rel = relative(repoRoot, originCwd);
	if (!rel || rel === ".") {
		return worktreeRoot;
	}
	const candidate = join(worktreeRoot, rel);
	return existsSync(candidate) ? candidate : worktreeRoot;
}

export function cleanupIsolatedWorktree(workspace: ColonyWorkspace): string | null {
	if (workspace.mode !== "worktree" || !workspace.repoRoot || !workspace.worktreeRoot || !workspace.branch) {
		return null;
	}

	const notes: string[] = [];
	try {
		if (existsSync(workspace.worktreeRoot)) {
			git(workspace.repoRoot, ["worktree", "remove", "--force", workspace.worktreeRoot]);
			notes.push("removed isolated worktree");
		}
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		notes.push(`worktree remove failed (${reason})`);
	}

	try {
		if (workspace.branch) {
			git(workspace.repoRoot, ["branch", "-D", workspace.branch]);
			notes.push("deleted temporary branch");
		}
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		notes.push(`branch cleanup skipped (${reason})`);
	}

	try {
		git(workspace.repoRoot, ["worktree", "prune"]);
	} catch {
		// ignore prune failures; this is best-effort hygiene.
	}

	try {
		const parent = dirname(workspace.worktreeRoot);
		rmSync(workspace.worktreeRoot, { recursive: true, force: true });
		if (existsSync(parent) && isEmptyDir(parent)) {
			rmSync(parent, { recursive: true, force: true });
		}
	} catch {
		// ignore filesystem cleanup failures.
	}

	return notes.length > 0 ? `Cleanup: ${notes.join("; ")}.` : "Cleanup: no stale isolated worktree artifacts found.";
}

function isEmptyDir(path: string): boolean {
	try {
		return readdirSync(path).length === 0;
	} catch {
		return false;
	}
}

export function worktreeEnabledByDefault(): boolean {
	const raw = process.env[WORKTREE_ENV_FLAG];
	if (typeof raw !== "string") {
		return true;
	}
	return !DISABLED_VALUES.has(raw.trim().toLowerCase());
}

/**
<!-- {=antColonyPrepareColonyWorkspaceDocs} -->

Prepare the execution workspace for a colony run. When worktree isolation is enabled and git
supports it, the colony gets a fresh isolated worktree on an `ant-colony/...` branch; otherwise it
falls back to the shared working directory and records the reason.

<!-- {/antColonyPrepareColonyWorkspaceDocs} -->
*/
export function prepareColonyWorkspace(opts: PrepareColonyWorkspaceOptions): ColonyWorkspace {
	const originCwd = resolve(opts.cwd);
	const enabled = opts.enabled ?? worktreeEnabledByDefault();
	if (!enabled) {
		return fallbackWorkspace(originCwd, `Worktree isolation disabled by ${WORKTREE_ENV_FLAG}.`);
	}

	try {
		const inside = git(originCwd, ["rev-parse", "--is-inside-work-tree"]);
		if (inside !== "true") {
			return fallbackWorkspace(originCwd, "Not inside a git repository; using shared working directory.");
		}

		const repoRoot = resolve(git(originCwd, ["rev-parse", "--show-toplevel"]));
		const headRef = git(originCwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
		const baseBranch = headRef === "HEAD" ? null : headRef;
		const safeRuntime = sanitizeSegment(opts.runtimeId);
		const suffix = randomSuffix();
		const branch = `ant-colony/${safeRuntime}-${suffix}`;
		const storageOptions = resolveColonyStorageOptions(opts.storageOptions);
		const worktreeParent = getColonyWorktreeParentDir(originCwd, storageOptions);
		const worktreeRoot = join(worktreeParent, `${safeRuntime}-${suffix}`);

		mkdirSync(worktreeParent, { recursive: true });
		git(repoRoot, ["worktree", "add", "-b", branch, worktreeRoot, "HEAD"]);

		return {
			mode: "worktree",
			originCwd,
			executionCwd: resolveExecutionCwd(worktreeRoot, repoRoot, originCwd),
			repoRoot,
			worktreeRoot,
			branch,
			baseBranch,
			note: null,
		};
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return fallbackWorkspace(
			originCwd,
			`Could not create isolated worktree (${reason}). Using shared working directory.`,
		);
	}
}

export function resumeColonyWorkspace(opts: ResumeColonyWorkspaceOptions): ColonyWorkspace {
	const saved = opts.savedWorkspace;
	if (!saved) {
		return prepareColonyWorkspace(opts);
	}

	const originCwd = resolve(opts.cwd);
	if (saved.mode === "shared") {
		return {
			...saved,
			originCwd,
			executionCwd: originCwd,
		};
	}

	const existingExecution = resolve(saved.executionCwd);
	if (existsSync(existingExecution)) {
		return {
			...saved,
			originCwd,
			executionCwd: existingExecution,
			note: saved.note ?? "Resuming in existing isolated worktree.",
		};
	}

	if (saved.repoRoot && saved.worktreeRoot && saved.branch) {
		try {
			mkdirSync(dirname(saved.worktreeRoot), { recursive: true });
			git(saved.repoRoot, ["worktree", "add", saved.worktreeRoot, saved.branch]);
			return {
				...saved,
				originCwd,
				executionCwd: resolveExecutionCwd(saved.worktreeRoot, saved.repoRoot, originCwd),
				note: "Re-attached missing worktree for resume.",
			};
		} catch {
			// Fall through to creating a fresh workspace.
		}
	}

	const recreated = prepareColonyWorkspace(opts);
	if (recreated.mode === "shared") {
		recreated.note = saved.note ?? "Previous worktree could not be recovered; resumed in shared working directory.";
	}
	return recreated;
}

export function formatWorkspaceSummary(workspace: ColonyWorkspace): string {
	if (workspace.mode === "worktree") {
		const branch = workspace.branch ? `${workspace.branch} ` : "";
		return `worktree ${branch}@ ${workspace.executionCwd}`.trim();
	}
	return `shared cwd @ ${workspace.executionCwd}`;
}

export function formatWorkspaceReport(workspace: ColonyWorkspace): string {
	if (workspace.mode === "worktree") {
		const lines = ["### 🧪 Workspace", "Mode: isolated git worktree", `Path: ${workspace.executionCwd}`];
		if (workspace.branch) {
			lines.push(`Branch: ${workspace.branch}`);
		}
		if (workspace.baseBranch) {
			lines.push(`Base branch: ${workspace.baseBranch}`);
		}
		if (workspace.note) {
			lines.push(`Note: ${workspace.note}`);
		}
		return lines.join("\n");
	}
	if (!workspace.note) {
		return "";
	}
	return [
		"### 🧪 Workspace",
		"Mode: shared working directory",
		`Path: ${workspace.executionCwd}`,
		`Note: ${workspace.note}`,
	].join("\n");
}
