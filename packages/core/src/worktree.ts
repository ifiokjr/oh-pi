import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { hostname } from "node:os";
import * as path from "node:path";
import { getMirroredWorkspacePathSegments, resolvePiAgentDir } from "./agent-paths.js";

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

export interface RepoWorktreeContext {
	cwd: string;
	repoRoot: string;
	currentWorktreeRoot: string;
	mainWorktreeRoot: string;
	commonDir: string;
	gitDir: string;
	currentBranch: string | null;
	isLinkedWorktree: boolean;
	current: Pick<GitWorktreeEntry, "path" | "branch" | "isMain" | "isManaged" | "metadata"> | null;
}

export interface RepoWorktreeSnapshot extends RepoWorktreeContext {
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

const DEFAULT_WORKTREE_ROOT = path.join(resolvePiAgentDir(), "worktrees");
const MANAGED_WORKTREE_TOUCH_INTERVAL_MS = 5 * 60_000;

type RepoWorktreeCacheEntry<TSnapshot> = {
	snapshot: TSnapshot | null;
	inFlight: Promise<TSnapshot | null> | null;
};

type RepoWorktreeContextProbe = {
	normalizedCwd: string;
	currentWorktreeRoot: string;
	commonDir: string;
	gitDir: string;
	currentBranch: string | null;
};

type RepoWorktreeProbe = RepoWorktreeContextProbe & {
	worktreeListOutput: string;
};

const repoWorktreeContextCache = new Map<string, RepoWorktreeCacheEntry<RepoWorktreeContext>>();
const repoWorktreeSnapshotCache = new Map<string, RepoWorktreeCacheEntry<RepoWorktreeSnapshot>>();

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

function gitAsync(cwd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile("git", ["-C", cwd, ...args], { encoding: "utf-8" }, (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(stdout.trim());
		});
	});
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

function getRepoWorktreeCacheKey(cwd: string, sharedRoot = DEFAULT_WORKTREE_ROOT): string {
	return `${normalizePath(cwd)}::${getSharedWorktreeRoot(sharedRoot)}`;
}

export function clearRepoWorktreeSnapshotCache(): void {
	repoWorktreeContextCache.clear();
	repoWorktreeSnapshotCache.clear();
}

function storeRepoWorktreeCacheEntry<TSnapshot>(
	cache: Map<string, RepoWorktreeCacheEntry<TSnapshot>>,
	cwd: string,
	sharedRoot: string,
	snapshot: TSnapshot | null,
	inFlight: Promise<TSnapshot | null> | null = null,
): TSnapshot | null {
	cache.set(getRepoWorktreeCacheKey(cwd, sharedRoot), {
		snapshot,
		inFlight,
	});
	return snapshot;
}

function getCachedRepoWorktreeCacheEntry<TSnapshot>(
	cache: Map<string, RepoWorktreeCacheEntry<TSnapshot>>,
	cwd: string,
	sharedRoot = DEFAULT_WORKTREE_ROOT,
): TSnapshot | null {
	return cache.get(getRepoWorktreeCacheKey(cwd, sharedRoot))?.snapshot ?? null;
}

export function getCachedRepoWorktreeContext(
	cwd: string,
	sharedRoot = DEFAULT_WORKTREE_ROOT,
): RepoWorktreeContext | null {
	return getCachedRepoWorktreeCacheEntry(repoWorktreeContextCache, cwd, sharedRoot);
}

export function getCachedRepoWorktreeSnapshot(
	cwd: string,
	sharedRoot = DEFAULT_WORKTREE_ROOT,
): RepoWorktreeSnapshot | null {
	return getCachedRepoWorktreeCacheEntry(repoWorktreeSnapshotCache, cwd, sharedRoot);
}

function isWithinWorktree(cwd: string, worktreePath: string): boolean {
	return cwd === worktreePath || cwd.startsWith(`${worktreePath}${path.sep}`);
}

function findCurrentWorktreePath(normalizedCwd: string, parsedEntries: Array<{ path: string }>): string | null {
	let match: string | null = null;
	for (const entry of parsedEntries) {
		if (!isWithinWorktree(normalizedCwd, entry.path)) {
			continue;
		}
		if (!match || entry.path.length > match.length) {
			match = entry.path;
		}
	}
	return match;
}

function readGitDirectoryInfo(worktreeRoot: string): { commonDir: string; gitDir: string } {
	const dotGitPath = path.join(worktreeRoot, ".git");
	const stat = fs.statSync(dotGitPath);
	if (stat.isDirectory()) {
		const gitDir = normalizePath(dotGitPath);
		return { commonDir: gitDir, gitDir };
	}
	const dotGitContents = fs.readFileSync(dotGitPath, "utf-8");
	const gitDirLine = dotGitContents.split(/\r?\n/).find((line) => line.trim().toLowerCase().startsWith("gitdir:"));
	if (!gitDirLine) {
		throw new Error(`Failed to resolve gitdir for worktree ${worktreeRoot}.`);
	}
	const gitDir = normalizePath(path.resolve(worktreeRoot, gitDirLine.slice("gitdir:".length).trim()));
	const commonDirPath = path.join(gitDir, "commondir");
	if (!fs.existsSync(commonDirPath)) {
		return { commonDir: gitDir, gitDir };
	}
	const commonDirRelative = fs.readFileSync(commonDirPath, "utf-8").trim();
	const commonDir = normalizePath(path.resolve(gitDir, commonDirRelative));
	return { commonDir, gitDir };
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
	return path.join(...getMirroredWorkspacePathSegments(normalizePath(repoRoot)));
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
	clearRepoWorktreeSnapshotCache();
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
	const lastSeenAtMs = entry.lastSeenAt ? Date.parse(entry.lastSeenAt) : Number.NaN;
	if (Number.isFinite(lastSeenAtMs) && Date.now() - lastSeenAtMs < MANAGED_WORKTREE_TOUCH_INTERVAL_MS) {
		return true;
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

function buildRepoWorktreeContextProbe(normalizedCwd: string, revParseOutput: string): RepoWorktreeContextProbe | null {
	const [topLevelPath, branchRef] = revParseOutput.split(/\r?\n/);
	if (!(topLevelPath && branchRef)) {
		return null;
	}
	const currentWorktreeRoot = normalizePath(topLevelPath);
	const { commonDir, gitDir } = readGitDirectoryInfo(currentWorktreeRoot);
	return {
		normalizedCwd,
		currentWorktreeRoot,
		commonDir,
		gitDir,
		currentBranch: branchRef === "HEAD" ? null : branchRef,
	};
}

function buildRepoWorktreeProbe(normalizedCwd: string, worktreeListOutput: string): RepoWorktreeProbe | null {
	const parsedEntries = parseWorktreeListPorcelain(worktreeListOutput);
	if (parsedEntries.length === 0) {
		return null;
	}
	const currentWorktreeRoot = findCurrentWorktreePath(normalizedCwd, parsedEntries);
	if (!currentWorktreeRoot) {
		return null;
	}
	const currentEntry = parsedEntries.find((entry) => entry.path === currentWorktreeRoot) ?? null;
	const { commonDir, gitDir } = readGitDirectoryInfo(currentWorktreeRoot);
	return {
		normalizedCwd,
		currentWorktreeRoot,
		commonDir,
		gitDir,
		currentBranch: currentEntry?.branch ?? null,
		worktreeListOutput,
	};
}

function inferRepoRootFromCommonDir(commonDir: string, currentWorktreeRoot: string): string {
	return path.basename(commonDir) === ".git" ? normalizePath(path.dirname(commonDir)) : currentWorktreeRoot;
}

function buildRepoWorktreeContext(
	probe: RepoWorktreeContextProbe,
	sharedRoot = DEFAULT_WORKTREE_ROOT,
): RepoWorktreeContext {
	const repoRoot = inferRepoRootFromCommonDir(probe.commonDir, probe.currentWorktreeRoot);
	const registry = loadWorktreeRegistry(repoRoot, sharedRoot);
	const metadata =
		registry.managedWorktrees.find((entry) => normalizePath(entry.worktreePath) === probe.currentWorktreeRoot) ?? null;
	return {
		cwd: probe.normalizedCwd,
		repoRoot,
		currentWorktreeRoot: probe.currentWorktreeRoot,
		mainWorktreeRoot: repoRoot,
		commonDir: probe.commonDir,
		gitDir: probe.gitDir,
		currentBranch: probe.currentBranch,
		isLinkedWorktree: probe.currentWorktreeRoot !== repoRoot,
		current: {
			path: probe.currentWorktreeRoot,
			branch: probe.currentBranch,
			isMain: probe.currentWorktreeRoot === repoRoot,
			isManaged: !!metadata,
			metadata,
		},
	};
}

function buildRepoWorktreeSnapshot(probe: RepoWorktreeProbe, sharedRoot = DEFAULT_WORKTREE_ROOT): RepoWorktreeSnapshot {
	const parsedEntries = parseWorktreeListPorcelain(probe.worktreeListOutput);
	const repoRoot = parsedEntries[0]?.path ?? probe.currentWorktreeRoot;
	const registry = loadWorktreeRegistry(repoRoot, sharedRoot);
	const metadataByPath = new Map(registry.managedWorktrees.map((entry) => [normalizePath(entry.worktreePath), entry]));
	const worktrees = parsedEntries.map((entry) => {
		const metadata = metadataByPath.get(entry.path) ?? null;
		return {
			...entry,
			isMain: entry.path === repoRoot,
			isCurrent: entry.path === probe.currentWorktreeRoot,
			isManaged: !!metadata,
			metadata,
		};
	});
	const knownPaths = new Set(worktrees.map((entry) => entry.path));
	const staleManagedWorktrees = registry.managedWorktrees.filter((entry) => !knownPaths.has(entry.worktreePath));
	const current = worktrees.find((entry) => entry.isCurrent) ?? null;
	const baseContext = buildRepoWorktreeContext(probe, sharedRoot);
	return {
		...baseContext,
		current,
		worktrees,
		registry,
		staleManagedWorktrees,
	};
}

function readRepoWorktreeContextProbe(cwd: string): RepoWorktreeContextProbe | null {
	const normalizedCwd = normalizePath(cwd);
	const revParseOutput = git(normalizedCwd, ["rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD"]);
	return buildRepoWorktreeContextProbe(normalizedCwd, revParseOutput);
}

async function readRepoWorktreeContextProbeAsync(cwd: string): Promise<RepoWorktreeContextProbe | null> {
	const normalizedCwd = normalizePath(cwd);
	const revParseOutput = await gitAsync(normalizedCwd, ["rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD"]);
	return buildRepoWorktreeContextProbe(normalizedCwd, revParseOutput);
}

function readRepoWorktreeProbe(cwd: string): RepoWorktreeProbe | null {
	const normalizedCwd = normalizePath(cwd);
	const worktreeListOutput = git(normalizedCwd, ["worktree", "list", "--porcelain"]);
	return buildRepoWorktreeProbe(normalizedCwd, worktreeListOutput);
}

async function readRepoWorktreeProbeAsync(cwd: string): Promise<RepoWorktreeProbe | null> {
	const normalizedCwd = normalizePath(cwd);
	const worktreeListOutput = await gitAsync(normalizedCwd, ["worktree", "list", "--porcelain"]);
	return buildRepoWorktreeProbe(normalizedCwd, worktreeListOutput);
}

export function getRepoWorktreeContext(cwd: string, sharedRoot = DEFAULT_WORKTREE_ROOT): RepoWorktreeContext | null {
	try {
		const probe = readRepoWorktreeContextProbe(cwd);
		return storeRepoWorktreeCacheEntry(
			repoWorktreeContextCache,
			cwd,
			sharedRoot,
			probe ? buildRepoWorktreeContext(probe, sharedRoot) : null,
		);
	} catch {
		return storeRepoWorktreeCacheEntry(repoWorktreeContextCache, cwd, sharedRoot, null);
	}
}

export async function refreshRepoWorktreeContext(
	cwd: string,
	sharedRoot = DEFAULT_WORKTREE_ROOT,
): Promise<RepoWorktreeContext | null> {
	const cacheKey = getRepoWorktreeCacheKey(cwd, sharedRoot);
	const cachedEntry = repoWorktreeContextCache.get(cacheKey);
	if (cachedEntry?.inFlight) {
		return cachedEntry.inFlight;
	}
	const refreshPromise = (async () => {
		try {
			const probe = await readRepoWorktreeContextProbeAsync(cwd);
			return storeRepoWorktreeCacheEntry(
				repoWorktreeContextCache,
				cwd,
				sharedRoot,
				probe ? buildRepoWorktreeContext(probe, sharedRoot) : null,
			);
		} catch {
			return storeRepoWorktreeCacheEntry(repoWorktreeContextCache, cwd, sharedRoot, null);
		}
	})();
	storeRepoWorktreeCacheEntry(repoWorktreeContextCache, cwd, sharedRoot, cachedEntry?.snapshot ?? null, refreshPromise);
	return refreshPromise;
}

export function getRepoWorktreeSnapshot(cwd: string, sharedRoot = DEFAULT_WORKTREE_ROOT): RepoWorktreeSnapshot | null {
	try {
		const probe = readRepoWorktreeProbe(cwd);
		return storeRepoWorktreeCacheEntry(
			repoWorktreeSnapshotCache,
			cwd,
			sharedRoot,
			probe ? buildRepoWorktreeSnapshot(probe, sharedRoot) : null,
		);
	} catch {
		return storeRepoWorktreeCacheEntry(repoWorktreeSnapshotCache, cwd, sharedRoot, null);
	}
}

export async function refreshRepoWorktreeSnapshot(
	cwd: string,
	sharedRoot = DEFAULT_WORKTREE_ROOT,
): Promise<RepoWorktreeSnapshot | null> {
	const cacheKey = getRepoWorktreeCacheKey(cwd, sharedRoot);
	const cachedEntry = repoWorktreeSnapshotCache.get(cacheKey);
	if (cachedEntry?.inFlight) {
		return cachedEntry.inFlight;
	}
	const refreshPromise = (async () => {
		try {
			const probe = await readRepoWorktreeProbeAsync(cwd);
			return storeRepoWorktreeCacheEntry(
				repoWorktreeSnapshotCache,
				cwd,
				sharedRoot,
				probe ? buildRepoWorktreeSnapshot(probe, sharedRoot) : null,
			);
		} catch {
			return storeRepoWorktreeCacheEntry(repoWorktreeSnapshotCache, cwd, sharedRoot, null);
		}
	})();
	storeRepoWorktreeCacheEntry(
		repoWorktreeSnapshotCache,
		cwd,
		sharedRoot,
		cachedEntry?.snapshot ?? null,
		refreshPromise,
	);
	return refreshPromise;
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
