import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { hostname } from "node:os";
import * as path from "node:path";
import { getMirroredWorkspacePathSegments, resolvePiAgentDir } from "@ifi/oh-pi-core";

export interface ManagedWorktreeOwner {
	instanceId: string;
	hostname: string;
	pid: number;
	createdFromCwd: string;
	sessionFile: string | null;
	sessionId: string | null;
	sessionName: string | null;
}

export interface ManagedWorktreeMetadata {
	id: string;
	repoRoot: string;
	worktreePath: string;
	branch: string;
	purpose: string;
	createdAt: string;
	lastSeenAt: string | null;
	owner: ManagedWorktreeOwner;
	createdFromBranch: string | null;
	createdFromRef: string;
}

export interface WorktreeRegistry {
	version: 1;
	repoRoot: string;
	updatedAt: string;
	managedWorktrees: ManagedWorktreeMetadata[];
}

export interface CreateManagedWorktreeOptions {
	cwd: string;
	branch: string;
	purpose: string;
	owner: ManagedWorktreeOwner;
	baseRef?: string;
}

export interface CreateManagedWorktreeResult {
	repoRoot: string;
	worktreePath: string;
	branch: string;
	createdBranch: boolean;
	metadata: ManagedWorktreeMetadata;
}

function nowIso(): string {
	return new Date().toISOString();
}

export function buildPaiInstanceId(startedAt = Date.now()): string {
	return `pai-${sanitizeSegment(hostname())}-${process.pid}-${startedAt.toString(36)}`;
}

function normalizePath(value: string): string {
	const resolved = path.resolve(value);
	try {
		return fs.realpathSync.native(resolved);
	} catch {
		return resolved;
	}
}

function git(cwd: string, args: string[]): string {
	return execFileSync("git", ["-C", cwd, ...args], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function gitOk(cwd: string, args: string[]): boolean {
	try {
		git(cwd, args);
		return true;
	} catch {
		return false;
	}
}

function sanitizeSegment(value: string): string {
	const cleaned = value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return cleaned || "worktree";
}

function randomSuffix(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getManagedWorktreeParentDir(repoRoot: string): string {
	return path.join(
		resolvePiAgentDir(),
		"worktrees",
		"root",
		...getMirroredWorkspacePathSegments(normalizePath(repoRoot)),
		"worktrees",
	);
}

function getWorktreeRegistryPath(repoRoot: string): string {
	return path.join(
		resolvePiAgentDir(),
		"worktrees",
		"root",
		...getMirroredWorkspacePathSegments(normalizePath(repoRoot)),
		"registry.json",
	);
}

function emptyRegistry(repoRoot: string): WorktreeRegistry {
	return {
		version: 1,
		repoRoot: normalizePath(repoRoot),
		updatedAt: nowIso(),
		managedWorktrees: [],
	};
}

function normalizeOwner(value: ManagedWorktreeOwner): ManagedWorktreeOwner {
	return {
		instanceId: value.instanceId.trim(),
		hostname: value.hostname.trim(),
		pid: value.pid,
		createdFromCwd: normalizePath(value.createdFromCwd),
		sessionFile: value.sessionFile ? normalizePath(value.sessionFile) : null,
		sessionId: value.sessionId?.trim() || null,
		sessionName: value.sessionName?.trim() || null,
	};
}

function normalizeManagedMetadata(value: ManagedWorktreeMetadata): ManagedWorktreeMetadata {
	return {
		id: value.id.trim(),
		repoRoot: normalizePath(value.repoRoot),
		worktreePath: normalizePath(value.worktreePath),
		branch: value.branch.trim(),
		purpose: value.purpose.trim(),
		createdAt: value.createdAt,
		lastSeenAt: value.lastSeenAt,
		owner: normalizeOwner(value.owner),
		createdFromBranch: value.createdFromBranch?.trim() || null,
		createdFromRef: value.createdFromRef.trim(),
	};
}

export function loadWorktreeRegistry(repoRoot: string): WorktreeRegistry {
	const normalizedRepoRoot = normalizePath(repoRoot);
	const registryPath = getWorktreeRegistryPath(normalizedRepoRoot);
	if (!fs.existsSync(registryPath)) {
		return emptyRegistry(normalizedRepoRoot);
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as Partial<WorktreeRegistry>;
		return {
			version: 1,
			repoRoot: normalizePath(typeof parsed.repoRoot === "string" ? parsed.repoRoot : normalizedRepoRoot),
			updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
			managedWorktrees: Array.isArray(parsed.managedWorktrees)
				? parsed.managedWorktrees
						.filter((entry): entry is ManagedWorktreeMetadata => !!entry && typeof entry === "object")
						.map((entry) => normalizeManagedMetadata(entry))
				: [],
		};
	} catch {
		return emptyRegistry(normalizedRepoRoot);
	}
}

function saveWorktreeRegistry(registry: WorktreeRegistry): void {
	const normalizedRepoRoot = normalizePath(registry.repoRoot);
	const registryPath = getWorktreeRegistryPath(normalizedRepoRoot);
	fs.mkdirSync(path.dirname(registryPath), { recursive: true });
	fs.writeFileSync(
		registryPath,
		JSON.stringify(
			{
				version: 1,
				repoRoot: normalizedRepoRoot,
				updatedAt: nowIso(),
				managedWorktrees: registry.managedWorktrees.map((entry) => normalizeManagedMetadata(entry)),
			},
			null,
			2,
		),
		"utf-8",
	);
}

function resolvePathPackageBranch(repoRoot: string): string | null {
	const headRef = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
	return headRef === "HEAD" ? null : headRef;
}

function branchExists(repoRoot: string, branch: string): boolean {
	return gitOk(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
}

function nextAvailableWorktreePath(parentDir: string, branch: string): string {
	const branchSlug = sanitizeSegment(branch);
	const firstCandidate = path.join(parentDir, branchSlug);
	if (!fs.existsSync(firstCandidate)) {
		return firstCandidate;
	}
	let counter = 2;
	while (true) {
		const candidate = path.join(parentDir, `${branchSlug}-${counter}`);
		if (!fs.existsSync(candidate)) {
			return candidate;
		}
		counter += 1;
	}
}

export function createOwnerMetadata(input: {
	instanceId: string;
	cwd: string;
	sessionFile?: string | null;
	sessionName?: string | null;
}): ManagedWorktreeOwner {
	const sessionFile = input.sessionFile ? normalizePath(input.sessionFile) : null;
	const sessionId = sessionFile ? path.basename(sessionFile).replace(/\.[^.]+$/, "") : null;
	return {
		instanceId: input.instanceId,
		hostname: hostname(),
		pid: process.pid,
		createdFromCwd: normalizePath(input.cwd),
		sessionFile,
		sessionId,
		sessionName: input.sessionName?.trim() || null,
	};
}

export function createManagedWorktree(options: CreateManagedWorktreeOptions): CreateManagedWorktreeResult {
	const branch = options.branch.trim();
	const purpose = options.purpose.trim();
	if (!branch) {
		throw new Error("Branch name is required.");
	}
	if (!purpose) {
		throw new Error("Purpose is required.");
	}

	const repoRoot = normalizePath(git(options.cwd, ["rev-parse", "--show-toplevel"]));
	const worktreeParentDir = getManagedWorktreeParentDir(repoRoot);
	fs.mkdirSync(worktreeParentDir, { recursive: true });
	const worktreePath = nextAvailableWorktreePath(worktreeParentDir, branch);
	const createdBranch = !branchExists(repoRoot, branch);
	const createdFromRef = options.baseRef?.trim() || "HEAD";
	const createdFromBranch = resolvePathPackageBranch(repoRoot);

	if (createdBranch) {
		git(repoRoot, ["worktree", "add", "-b", branch, worktreePath, createdFromRef]);
	} else {
		git(repoRoot, ["worktree", "add", worktreePath, branch]);
	}

	const metadata: ManagedWorktreeMetadata = {
		id: `${sanitizeSegment(branch)}-${randomSuffix()}`,
		repoRoot,
		worktreePath: normalizePath(worktreePath),
		branch,
		purpose,
		createdAt: nowIso(),
		lastSeenAt: null,
		owner: normalizeOwner(options.owner),
		createdFromBranch,
		createdFromRef,
	};

	const registry = loadWorktreeRegistry(repoRoot);
	registry.managedWorktrees = registry.managedWorktrees.filter((entry) => entry.worktreePath !== metadata.worktreePath);
	registry.managedWorktrees.push(metadata);
	saveWorktreeRegistry(registry);

	return {
		repoRoot,
		worktreePath: metadata.worktreePath,
		branch,
		createdBranch,
		metadata,
	};
}

export function removeManagedWorktree(metadata: ManagedWorktreeMetadata): { note: string } {
	const repoRoot = normalizePath(metadata.repoRoot);
	const worktreePath = normalizePath(metadata.worktreePath);
	let note = "Removed pi-owned worktree.";

	try {
		git(repoRoot, ["worktree", "remove", "--force", worktreePath]);
		note = "Removed pi-owned worktree from git worktree list.";
	} catch {
		if (fs.existsSync(worktreePath)) {
			throw new Error(`Failed to remove worktree at ${worktreePath}.`);
		}
		note = "Worktree directory was already missing; removed stale pi registry entry.";
	}

	try {
		git(repoRoot, ["worktree", "prune"]);
	} catch {
		// ignore best-effort cleanup failures
	}

	try {
		const parentDir = path.dirname(worktreePath);
		if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
			fs.rmdirSync(parentDir);
		}
	} catch {
		// ignore best-effort cleanup failures
	}

	const registry = loadWorktreeRegistry(repoRoot);
	registry.managedWorktrees = registry.managedWorktrees.filter((entry) => entry.worktreePath !== worktreePath);
	saveWorktreeRegistry(registry);
	return { note };
}
