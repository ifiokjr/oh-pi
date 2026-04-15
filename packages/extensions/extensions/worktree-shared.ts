import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { homedir, hostname } from "node:os";
import * as path from "node:path";
import * as PiCodingAgent from "@mariozechner/pi-coding-agent";

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

export interface GitWorktreeEntry {
	path: string;
	branch: string | null;
	head: string | null;
	bare: boolean;
	detached: boolean;
	lockedReason: string | null;
	prunableReason: string | null;
	isMain: boolean;
	isCurrent: boolean;
	isManaged: boolean;
	metadata: ManagedWorktreeMetadata | null;
}

export interface RepoWorktreeSnapshot {
	cwd: string;
	repoRoot: string;
	currentWorktreeRoot: string;
	mainWorktreeRoot: string;
	commonDir: string;
	gitDir: string;
	currentBranch: string | null;
	isLinkedWorktree: boolean;
	current: GitWorktreeEntry | null;
	worktrees: GitWorktreeEntry[];
	registry: WorktreeRegistry;
	staleManagedWorktrees: ManagedWorktreeMetadata[];
}

export interface CreateManagedWorktreeOptions {
	cwd: string;
	branch: string;
	purpose: string;
	owner: ManagedWorktreeOwner;
	baseRef?: string;
	sharedRoot?: string;
}

export interface CreateManagedWorktreeResult {
	repoRoot: string;
	worktreePath: string;
	branch: string;
	createdBranch: boolean;
	metadata: ManagedWorktreeMetadata;
}

const DEFAULT_WORKTREE_ROOT = path.join(getPiAgentDirectory(), "worktrees");

function getPiAgentDirectory(): string {
	const getAgentDir = (PiCodingAgent as { getAgentDir?: () => string }).getAgentDir;
	return typeof getAgentDir === "function" ? getAgentDir() : path.join(homedir(), ".pi", "agent");
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

function resolveGitPath(cwd: string, value: string): string {
	return normalizePath(path.resolve(cwd, value));
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

function stripRefsHeads(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	return value.startsWith("refs/heads/") ? value.slice("refs/heads/".length) : value;
}

function getMirroredWorkspacePath(repoRoot: string): string {
	const resolved = normalizePath(repoRoot);
	const parsed = path.parse(resolved);
	const relativeSegments = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
	const rootSegment = parsed.root
		? parsed.root
				.replaceAll(/[^a-zA-Z0-9]+/g, "-")
				.replaceAll(/^-+|-+$/g, "")
				.toLowerCase() || "root"
		: "root";
	return path.join(rootSegment, ...relativeSegments);
}

export function getSharedWorktreeRoot(sharedRoot = DEFAULT_WORKTREE_ROOT): string {
	return normalizePath(sharedRoot);
}

export function getRepoWorktreeStorageRoot(repoRoot: string, sharedRoot = DEFAULT_WORKTREE_ROOT): string {
	return path.join(getSharedWorktreeRoot(sharedRoot), "root", getMirroredWorkspacePath(repoRoot));
}

export function getManagedWorktreeParentDir(repoRoot: string, sharedRoot = DEFAULT_WORKTREE_ROOT): string {
	return path.join(getRepoWorktreeStorageRoot(repoRoot, sharedRoot), "worktrees");
}

export function getWorktreeRegistryPath(repoRoot: string, sharedRoot = DEFAULT_WORKTREE_ROOT): string {
	return path.join(getRepoWorktreeStorageRoot(repoRoot, sharedRoot), "registry.json");
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

export function loadWorktreeRegistry(repoRoot: string, sharedRoot = DEFAULT_WORKTREE_ROOT): WorktreeRegistry {
	const normalizedRepoRoot = normalizePath(repoRoot);
	const registryPath = getWorktreeRegistryPath(normalizedRepoRoot, sharedRoot);
	if (!fs.existsSync(registryPath)) {
		return emptyRegistry(normalizedRepoRoot);
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as Partial<WorktreeRegistry>;
		const managedWorktrees = Array.isArray(parsed.managedWorktrees)
			? parsed.managedWorktrees
					.filter((entry): entry is ManagedWorktreeMetadata => !!entry && typeof entry === "object")
					.map((entry) => normalizeManagedMetadata(entry))
			: [];
		return {
			version: 1,
			repoRoot: normalizePath(typeof parsed.repoRoot === "string" ? parsed.repoRoot : normalizedRepoRoot),
			updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
			managedWorktrees,
		};
	} catch {
		return emptyRegistry(normalizedRepoRoot);
	}
}

export function saveWorktreeRegistry(registry: WorktreeRegistry, sharedRoot = DEFAULT_WORKTREE_ROOT): void {
	const normalizedRepoRoot = normalizePath(registry.repoRoot);
	const registryPath = getWorktreeRegistryPath(normalizedRepoRoot, sharedRoot);
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

function upsertManagedWorktreeMetadata(
	repoRoot: string,
	metadata: ManagedWorktreeMetadata,
	sharedRoot = DEFAULT_WORKTREE_ROOT,
): ManagedWorktreeMetadata {
	const registry = loadWorktreeRegistry(repoRoot, sharedRoot);
	const normalized = normalizeManagedMetadata(metadata);
	const existingIndex = registry.managedWorktrees.findIndex((entry) => entry.worktreePath === normalized.worktreePath);
	if (existingIndex >= 0) {
		registry.managedWorktrees[existingIndex] = normalized;
	} else {
		registry.managedWorktrees.push(normalized);
	}
	saveWorktreeRegistry(registry, sharedRoot);
	return normalized;
}

export function touchManagedWorktreeSeen(
	repoRoot: string,
	worktreePath: string,
	sharedRoot = DEFAULT_WORKTREE_ROOT,
): boolean {
	const registry = loadWorktreeRegistry(repoRoot, sharedRoot);
	const normalizedWorktreePath = normalizePath(worktreePath);
	const entry = registry.managedWorktrees.find((item) => item.worktreePath === normalizedWorktreePath);
	if (!entry) {
		return false;
	}
	entry.lastSeenAt = nowIso();
	saveWorktreeRegistry(registry, sharedRoot);
	return true;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Git's porcelain format mixes optional keyed lines that are easiest to parse in one pass.
function parseWorktreeListPorcelain(output: string): Array<{
	path: string;
	branch: string | null;
	head: string | null;
	bare: boolean;
	detached: boolean;
	lockedReason: string | null;
	prunableReason: string | null;
}> {
	const blocks = output
		.trim()
		.split(/\n\s*\n/g)
		.map((block) =>
			block
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean),
		)
		.filter((lines) => lines.length > 0);

	const entries: Array<{
		path: string;
		branch: string | null;
		head: string | null;
		bare: boolean;
		detached: boolean;
		lockedReason: string | null;
		prunableReason: string | null;
	}> = [];

	for (const lines of blocks) {
		let worktreePath: string | null = null;
		let branch: string | null = null;
		let head: string | null = null;
		let bare = false;
		let detached = false;
		let lockedReason: string | null = null;
		let prunableReason: string | null = null;

		for (const line of lines) {
			const [key, ...rest] = line.split(" ");
			const value = rest.join(" ").trim();
			if (key === "worktree") {
				worktreePath = normalizePath(value);
				continue;
			}
			if (key === "branch") {
				branch = stripRefsHeads(value);
				continue;
			}
			if (key === "HEAD") {
				head = value || null;
				continue;
			}
			if (key === "bare") {
				bare = true;
				continue;
			}
			if (key === "detached") {
				detached = true;
				continue;
			}
			if (key === "locked") {
				lockedReason = value || "locked";
				continue;
			}
			if (key === "prunable") {
				prunableReason = value || "prunable";
			}
		}

		if (!worktreePath) {
			continue;
		}

		entries.push({
			path: worktreePath,
			branch,
			head,
			bare,
			detached,
			lockedReason,
			prunableReason,
		});
	}

	return entries;
}

export function getRepoWorktreeSnapshot(cwd: string, sharedRoot = DEFAULT_WORKTREE_ROOT): RepoWorktreeSnapshot | null {
	const normalizedCwd = normalizePath(cwd);
	try {
		if (git(normalizedCwd, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
			return null;
		}

		const currentWorktreeRoot = resolveGitPath(normalizedCwd, git(normalizedCwd, ["rev-parse", "--show-toplevel"]));
		const commonDir = resolveGitPath(currentWorktreeRoot, git(currentWorktreeRoot, ["rev-parse", "--git-common-dir"]));
		const gitDir = resolveGitPath(currentWorktreeRoot, git(currentWorktreeRoot, ["rev-parse", "--absolute-git-dir"]));
		const currentBranchRaw = git(currentWorktreeRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
		const currentBranch = currentBranchRaw === "HEAD" ? null : currentBranchRaw;
		const parsedEntries = parseWorktreeListPorcelain(git(currentWorktreeRoot, ["worktree", "list", "--porcelain"]));
		const fallbackMainRoot =
			path.basename(commonDir) === ".git" ? normalizePath(path.dirname(commonDir)) : currentWorktreeRoot;
		const mainWorktreeRoot = parsedEntries[0]?.path ?? fallbackMainRoot;
		const repoRoot = normalizePath(mainWorktreeRoot);
		const registry = loadWorktreeRegistry(repoRoot, sharedRoot);
		const metadataByPath = new Map(
			registry.managedWorktrees.map((entry) => [normalizePath(entry.worktreePath), entry]),
		);
		const worktrees = parsedEntries.map((entry) => {
			const metadata = metadataByPath.get(entry.path) ?? null;
			return {
				...entry,
				isMain: entry.path === repoRoot,
				isCurrent: entry.path === currentWorktreeRoot,
				isManaged: !!metadata,
				metadata,
			};
		});
		const knownPaths = new Set(worktrees.map((entry) => entry.path));
		const staleManagedWorktrees = registry.managedWorktrees.filter((entry) => !knownPaths.has(entry.worktreePath));
		const current = worktrees.find((entry) => entry.isCurrent) ?? null;

		return {
			cwd: normalizedCwd,
			repoRoot,
			currentWorktreeRoot,
			mainWorktreeRoot: repoRoot,
			commonDir,
			gitDir,
			currentBranch,
			isLinkedWorktree: currentWorktreeRoot !== repoRoot,
			current,
			worktrees,
			registry,
			staleManagedWorktrees,
		};
	} catch {
		return null;
	}
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

export function createManagedWorktree(options: CreateManagedWorktreeOptions): CreateManagedWorktreeResult {
	const branch = options.branch.trim();
	const purpose = options.purpose.trim();
	if (!branch) {
		throw new Error("Branch name is required.");
	}
	if (!purpose) {
		throw new Error("Purpose is required.");
	}

	const snapshot = getRepoWorktreeSnapshot(options.cwd, options.sharedRoot);
	if (!snapshot) {
		throw new Error("Not inside a git repository.");
	}

	const repoRoot = snapshot.repoRoot;
	const worktreeParentDir = getManagedWorktreeParentDir(repoRoot, options.sharedRoot);
	fs.mkdirSync(worktreeParentDir, { recursive: true });
	const worktreePath = nextAvailableWorktreePath(worktreeParentDir, branch);
	const createdBranch = !branchExists(repoRoot, branch);
	const createdFromRef = options.baseRef?.trim() || "HEAD";

	if (createdBranch) {
		git(repoRoot, ["worktree", "add", "-b", branch, worktreePath, createdFromRef]);
	} else {
		git(repoRoot, ["worktree", "add", worktreePath, branch]);
	}

	const normalizedWorktreePath = normalizePath(worktreePath);
	const metadata: ManagedWorktreeMetadata = {
		id: `${sanitizeSegment(branch)}-${randomSuffix()}`,
		repoRoot,
		worktreePath: normalizedWorktreePath,
		branch,
		purpose,
		createdAt: nowIso(),
		lastSeenAt: null,
		owner: normalizeOwner(options.owner),
		createdFromBranch: snapshot.currentBranch,
		createdFromRef,
	};
	upsertManagedWorktreeMetadata(repoRoot, metadata, options.sharedRoot);

	return {
		repoRoot,
		worktreePath: normalizedWorktreePath,
		branch,
		createdBranch,
		metadata,
	};
}

export interface RemoveManagedWorktreeResult {
	metadata: ManagedWorktreeMetadata;
	removed: boolean;
	removedFromGit: boolean;
	removedRegistryEntry: boolean;
	note: string;
}

function pruneRegistryEntry(repoRoot: string, worktreePath: string, sharedRoot = DEFAULT_WORKTREE_ROOT): boolean {
	const registry = loadWorktreeRegistry(repoRoot, sharedRoot);
	const normalizedWorktreePath = normalizePath(worktreePath);
	const before = registry.managedWorktrees.length;
	registry.managedWorktrees = registry.managedWorktrees.filter(
		(entry) => entry.worktreePath !== normalizedWorktreePath,
	);
	if (registry.managedWorktrees.length === before) {
		return false;
	}
	saveWorktreeRegistry(registry, sharedRoot);
	return true;
}

export function removeManagedWorktree(
	metadata: ManagedWorktreeMetadata,
	sharedRoot = DEFAULT_WORKTREE_ROOT,
): RemoveManagedWorktreeResult {
	const repoRoot = normalizePath(metadata.repoRoot);
	const worktreePath = normalizePath(metadata.worktreePath);
	let removedFromGit = false;
	let note = "Worktree record removed.";

	try {
		git(repoRoot, ["worktree", "remove", "--force", worktreePath]);
		removedFromGit = true;
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
		// best-effort cleanup
	}

	try {
		const parentDir = path.dirname(worktreePath);
		if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
			fs.rmdirSync(parentDir);
		}
	} catch {
		// ignore best-effort cleanup failures
	}

	const removedRegistryEntry = pruneRegistryEntry(repoRoot, worktreePath, sharedRoot);
	return {
		metadata,
		removed: removedFromGit || removedRegistryEntry,
		removedFromGit,
		removedRegistryEntry,
		note,
	};
}

export function formatOwnerLabel(owner: ManagedWorktreeOwner): string {
	const session = owner.sessionName || owner.sessionId;
	return session ? `${owner.instanceId} (${session})` : owner.instanceId;
}

export function formatWorktreeKind(entry: Pick<GitWorktreeEntry, "isMain" | "isManaged">): string {
	if (entry.isMain) {
		return "main";
	}
	return entry.isManaged ? "pi-owned" : "external";
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
