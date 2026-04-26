/* C8 ignore file */
import path from "node:path";
import process from "node:process";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { recordRuntimeSample } from "./watchdog-runtime-diagnostics";
import {
	buildPaiInstanceId,
	createManagedWorktree,
	createOwnerMetadata,
	formatOwnerLabel,
	formatWorktreeKind,
	getRepoWorktreeContext,
	getRepoWorktreeSnapshot,
	removeManagedWorktree,
	touchManagedWorktreeSeen,
} from "./worktree-shared";
import type {
	GitWorktreeEntry,
	ManagedWorktreeMetadata,
	RepoWorktreeContext,
	RepoWorktreeSnapshot,
} from "./worktree-shared";

const COMMAND = "worktree";
const COMMAND_ALIASES = [COMMAND, "Worktree", "wt"] as const;
const instanceId = buildPaiInstanceId();

function relativeDisplayPath(root: string, target: string): string {
	const relative = path.relative(root, target);
	return !relative || relative === "." ? "." : relative;
}

function kindBadge(entry: GitWorktreeEntry): string {
	if (entry.isMain) {
		return "[main]";
	}
	if (entry.isManaged) {
		return "[pi-owned]";
	}
	return "[external]";
}

function currentBadge(entry: GitWorktreeEntry): string {
	return entry.isCurrent ? "[current] " : "";
}

function renderEntry(entry: GitWorktreeEntry, repoRoot: string): string[] {
	const lines = [`- ${currentBadge(entry)}${kindBadge(entry)} ${entry.branch ?? "(detached)"}`];
	lines.push(`  path: ${entry.path}`);
	lines.push(`  repo-relative: ${relativeDisplayPath(repoRoot, entry.path)}`);

	if (entry.metadata) {
		lines.push(`  purpose: ${entry.metadata.purpose}`);
		lines.push(`  owner: ${formatOwnerLabel(entry.metadata.owner)}`);
		lines.push(`  created: ${entry.metadata.createdAt}`);
		if (entry.metadata.lastSeenAt) {
			lines.push(`  last seen: ${entry.metadata.lastSeenAt}`);
		}
	}

	if (entry.lockedReason) {
		lines.push(`  locked: ${entry.lockedReason}`);
	}

	if (entry.prunableReason) {
		lines.push(`  prunable: ${entry.prunableReason}`);
	}

	return lines;
}

function appendInventory(lines: string[], snapshot: RepoWorktreeSnapshot): void {
	lines.push("## Inventory");
	lines.push(`- Total worktrees: ${snapshot.worktrees.length}`);
	lines.push(
		`- pi-owned: ${snapshot.worktrees.filter((entry) => entry.isManaged).length + snapshot.staleManagedWorktrees.length}`,
	);
	lines.push(`- External/manual: ${snapshot.worktrees.filter((entry) => !(entry.isManaged || entry.isMain)).length}`);
	lines.push("");
	lines.push("## Worktrees");

	for (const entry of snapshot.worktrees) {
		lines.push(...renderEntry(entry, snapshot.repoRoot), "");
	}

	if (snapshot.staleManagedWorktrees.length === 0) {
		return;
	}

	lines.push("## Stale pi metadata");
	for (const entry of snapshot.staleManagedWorktrees) {
		lines.push(`- [stale] ${entry.branch}`);
		lines.push(`  path: ${entry.worktreePath}`);
		lines.push(`  purpose: ${entry.purpose}`);
		lines.push(`  owner: ${formatOwnerLabel(entry.owner)}`);
		lines.push("");
	}
}

function buildStatusReport(snapshot: RepoWorktreeSnapshot): string {
	const { current } = snapshot;
	const lines = ["# /worktree status", "", "## Current checkout"];
	lines.push(`- Repo: ${path.basename(snapshot.repoRoot)}`);
	lines.push(`- Repo root: ${snapshot.repoRoot}`);
	lines.push(`- Main checkout: ${snapshot.mainWorktreeRoot}`);
	lines.push(`- Current worktree root: ${snapshot.currentWorktreeRoot}`);
	lines.push(`- Branch: ${snapshot.currentBranch ?? "(detached)"}`);
	lines.push(
		`- Kind: ${snapshot.isLinkedWorktree ? formatWorktreeKind(current ?? { isMain: false, isManaged: false }) : "main"}`,
	);
	lines.push(`- Git common dir: ${snapshot.commonDir}`);
	lines.push(`- Git dir: ${snapshot.gitDir}`);

	if (current?.isManaged && current.metadata) {
		lines.push("- Owned by pi: yes");
		lines.push(`- Purpose: ${current.metadata.purpose}`);
		lines.push(`- Owner instance: ${current.metadata.owner.instanceId}`);
		lines.push(
			`- Owner session: ${current.metadata.owner.sessionName ?? current.metadata.owner.sessionId ?? "(unknown)"}`,
		);
		lines.push(`- Created at: ${current.metadata.createdAt}`);
		lines.push(`- Last seen: ${current.metadata.lastSeenAt ?? "(never)"}`);
	} else {
		lines.push("- Owned by pi: no");
	}

	lines.push("");
	appendInventory(lines, snapshot);
	lines.push("## Helpful commands");
	lines.push("- `/worktree list`");
	lines.push("- `/worktree open <branch|path>`");
	lines.push("- `/worktree create <branch> --purpose <why>`");
	lines.push("- `/worktree cleanup <branch|path|id|all>`");
	return lines.join("\n");
}

function buildListReport(snapshot: RepoWorktreeSnapshot): string {
	const lines = [
		"# /worktree list",
		"",
		`- Repo: ${path.basename(snapshot.repoRoot)}`,
		`- Current: ${snapshot.current?.branch ?? snapshot.currentBranch ?? "(detached)"}`,
		"",
	];
	appendInventory(lines, snapshot);
	lines.push("## Legend");
	lines.push("- `[main]` = canonical main checkout");
	lines.push("- `[pi-owned]` = created and tracked by pi");
	lines.push("- `[external]` = manual/non-pi worktree");
	lines.push("- `[current]` = this session's current checkout");
	return lines.join("\n");
}

function sendReport(pi: ExtensionAPI, content: string): void {
	pi.sendMessage({
		content,
		customType: "pi-worktree",
		display: true,
	});
}

function getCurrentSessionName(pi: ExtensionAPI): string | null {
	return typeof pi.getSessionName === "function" ? (pi.getSessionName() ?? null) : null;
}

function parseCreateArgs(input: string): { branch: string; purpose: string } | null {
	const trimmed = input.trim();
	if (!trimmed) {
		return null;
	}

	const purposeFlag = " --purpose ";
	const flagIndex = trimmed.indexOf(purposeFlag);
	if (flagIndex !== -1) {
		const branch = trimmed.slice(0, flagIndex).trim();
		const purpose = trimmed.slice(flagIndex + purposeFlag.length).trim();
		return branch ? { branch, purpose } : null;
	}

	const [branch, ...rest] = trimmed.split(/\s+/);
	if (!branch) {
		return null;
	}

	return { branch, purpose: rest.join(" ").trim() };
}

function matchesTarget(metadata: ManagedWorktreeMetadata, target: string): boolean {
	return (
		metadata.id === target ||
		metadata.branch === target ||
		metadata.worktreePath === target ||
		path.basename(metadata.worktreePath) === target
	);
}

function findManagedTargets(snapshot: RepoWorktreeSnapshot, target: string): ManagedWorktreeMetadata[] {
	const normalizedTarget = target.trim();
	const matches =
		normalizedTarget === "all"
			? [
					...snapshot.worktrees.flatMap((entry) => (entry.metadata ? [entry.metadata] : [])),
					...snapshot.staleManagedWorktrees,
				]
			: [
					...snapshot.worktrees.flatMap((entry) =>
						entry.metadata && matchesTarget(entry.metadata, normalizedTarget) ? [entry.metadata] : [],
					),
					...snapshot.staleManagedWorktrees.filter((entry) => matchesTarget(entry, normalizedTarget)),
				];

	return matches.filter(
		(entry, index, all) => all.findIndex((item) => item.worktreePath === entry.worktreePath) === index,
	);
}

function findWorktreeEntry(snapshot: RepoWorktreeSnapshot, target: string): GitWorktreeEntry | null {
	const normalizedTarget = target.trim();
	return (
		snapshot.worktrees.find(
			(entry) =>
				entry.branch === normalizedTarget ||
				entry.path === normalizedTarget ||
				path.basename(entry.path) === normalizedTarget,
		) ?? null
	);
}

async function chooseWorktreeTarget(
	snapshot: RepoWorktreeSnapshot,
	ctx: ExtensionContext,
): Promise<GitWorktreeEntry | null> {
	if (snapshot.worktrees.length === 0) {
		return null;
	}

	if (snapshot.worktrees.length === 1 || !ctx.hasUI || typeof ctx.ui.select !== "function") {
		return snapshot.current ?? snapshot.worktrees[0] ?? null;
	}

	const options = snapshot.worktrees.map((entry) => ({
		description: entry.metadata?.purpose ?? entry.path,
		label: `${currentBadge(entry)}${kindBadge(entry)} ${entry.branch ?? "(detached)"}`.trim(),
		value: entry.path,
	}));
	const selected = await ctx.ui.select("Select a worktree to open", options);
	return selected ? findWorktreeEntry(snapshot, selected) : null;
}

function currentStatusText(snapshot: RepoWorktreeContext | null): string | undefined {
	if (!snapshot) {
		return undefined;
	}

	const repo = path.basename(snapshot.repoRoot);
	const branch = snapshot.current?.branch ?? snapshot.currentBranch ?? "detached";
	if (!snapshot.isLinkedWorktree) {
		return undefined;
	}
	if (snapshot.current?.isManaged && snapshot.current.metadata) {
		return `${repo} · pi wt ${branch} · ${snapshot.current.metadata.purpose}`;
	}
	return `${repo} · external wt ${branch}`;
}

function refreshStatus(ctx: ExtensionContext): RepoWorktreeContext | null {
	const startedAt = Date.now();
	const snapshot = getRepoWorktreeContext(ctx.cwd);
	if (snapshot?.current?.isManaged) {
		touchManagedWorktreeSeen(snapshot.repoRoot, snapshot.current.path);
	}
	ctx.ui.setStatus("pi-worktree", currentStatusText(snapshot));
	recordRuntimeSample("worktree", "event", "status_refresh", Date.now() - startedAt, "worktree");
	return snapshot;
}

async function openPath(pi: ExtensionAPI, targetPath: string): Promise<boolean> {
	const normalized = path.resolve(targetPath);
	const { platform } = process;
	const command =
		platform === "darwin"
			? { args: [normalized], bin: "open" }
			: platform === "win32"
				? { bin: "cmd", args: ["/c", "start", "", normalized] }
				: { bin: "xdg-open", args: [normalized] };

	try {
		const result = await pi.exec(command.bin, command.args, { timeout: 8000 });
		return result.exitCode === 0;
	} catch {
		return false;
	}
}

async function handleStatus(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	refreshStatus(ctx);
	const snapshot = getRepoWorktreeSnapshot(ctx.cwd);
	if (!snapshot) {
		ctx.ui.notify("Not inside a git repository.", "warning");
		return;
	}
	sendReport(pi, buildStatusReport(snapshot));
}

async function handleList(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	refreshStatus(ctx);
	const snapshot = getRepoWorktreeSnapshot(ctx.cwd);
	if (!snapshot) {
		ctx.ui.notify("Not inside a git repository.", "warning");
		return;
	}
	sendReport(pi, buildListReport(snapshot));
}

async function handleCreate(pi: ExtensionAPI, args: string, ctx: ExtensionContext): Promise<void> {
	const parsed = parseCreateArgs(args);
	if (!parsed) {
		ctx.ui.notify(
			"Usage: /worktree create <branch> [purpose] or /worktree create <branch> --purpose <purpose>",
			"warning",
		);
		return;
	}

	let { purpose } = parsed;
	if (!purpose) {
		purpose = (await ctx.ui.input("Worktree purpose", "Why are you creating this worktree?"))?.trim() ?? "";
	}
	if (!purpose) {
		ctx.ui.notify("A purpose is required so pi can track and clean up owned worktrees safely.", "warning");
		return;
	}

	try {
		const result = createManagedWorktree({
			branch: parsed.branch,
			cwd: ctx.cwd,
			owner: createOwnerMetadata({
				instanceId,
				cwd: ctx.cwd,
				sessionFile: ctx.sessionManager.getSessionFile?.() ?? null,
				sessionName: getCurrentSessionName(pi),
			}),
			purpose,
		});

		refreshStatus(ctx);
		ctx.ui.notify(`Created pi-owned worktree ${result.branch} at ${result.worktreePath}.`, "info");
		sendReport(
			pi,
			[
				"# /worktree create",
				"",
				`- Branch: ${result.branch}`,
				`- Path: ${result.worktreePath}`,
				`- Repo root: ${result.repoRoot}`,
				`- Created branch: ${result.createdBranch ? "yes" : "no (attached existing branch)"}`,
				`- Purpose: ${result.metadata.purpose}`,
				`- Owner instance: ${result.metadata.owner.instanceId}`,
				`- Owner session: ${result.metadata.owner.sessionName ?? result.metadata.owner.sessionId ?? "(unknown)"}`,
				"",
				"## Next steps",
				`- \`cd ${result.worktreePath}\``,
				`- \`/worktree open ${result.branch}\``,
			].join("\n"),
		);
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
	}
}

async function handleOpen(pi: ExtensionAPI, args: string, ctx: ExtensionContext): Promise<void> {
	refreshStatus(ctx);
	const snapshot = getRepoWorktreeSnapshot(ctx.cwd);
	if (!snapshot) {
		ctx.ui.notify("Not inside a git repository.", "warning");
		return;
	}

	const entry = args.trim() ? findWorktreeEntry(snapshot, args) : await chooseWorktreeTarget(snapshot, ctx);
	if (!entry) {
		ctx.ui.notify(args.trim() ? `No worktree matched: ${args.trim()}` : "No worktree selected.", "warning");
		return;
	}

	const opened = await openPath(pi, entry.path);
	const lines = [
		"# /worktree open",
		"",
		`- Target: ${entry.branch ?? "(detached)"}`,
		`- Path: ${entry.path}`,
		`- Kind: ${formatWorktreeKind(entry)}`,
		opened ? "- Opened in your system file opener." : "- Could not launch the system opener automatically.",
		"",
		"## Fallback",
		`- \`cd ${entry.path}\``,
	];
	if (entry.metadata) {
		lines.push(`- Purpose: ${entry.metadata.purpose}`);
	}
	ctx.ui.notify(opened ? `Opened ${entry.path}` : `Use: cd ${entry.path}`, opened ? "info" : "warning");
	sendReport(pi, lines.join("\n"));
}

async function handleCleanup(pi: ExtensionAPI, args: string, ctx: ExtensionContext): Promise<void> {
	refreshStatus(ctx);
	const snapshot = getRepoWorktreeSnapshot(ctx.cwd);
	if (!snapshot) {
		ctx.ui.notify("Not inside a git repository.", "warning");
		return;
	}

	const target = args.trim();
	if (!target) {
		ctx.ui.notify("Usage: /worktree cleanup <branch|path|id|all>", "warning");
		return;
	}

	const managedTargets = findManagedTargets(snapshot, target);
	if (managedTargets.length === 0) {
		const externalMatch = findWorktreeEntry(snapshot, target);
		if (externalMatch && !externalMatch.isManaged) {
			ctx.ui.notify(
				`Matched external worktree ${externalMatch.path}. pi only cleans pi-owned worktrees by default.`,
				"warning",
			);
			return;
		}
		ctx.ui.notify(`No pi-owned worktree matched: ${target}`, "warning");
		return;
	}

	const removable = managedTargets.filter((entry) => entry.worktreePath !== snapshot.currentWorktreeRoot);
	const skipped = managedTargets.filter((entry) => entry.worktreePath === snapshot.currentWorktreeRoot);
	if (removable.length === 0) {
		ctx.ui.notify("Refusing to clean up the current worktree. Switch to another checkout first.", "warning");
		return;
	}

	const targetLabel =
		target === "all" ? `all ${removable.length} pi-owned worktrees` : removable.map((entry) => entry.branch).join(", ");
	const confirmed = await ctx.ui.confirm(
		"Clean up worktree?",
		`Remove ${targetLabel}? External/manual worktrees will be left alone.`,
	);
	if (!confirmed) {
		return;
	}

	try {
		const results = removable.map((entry) => removeManagedWorktree(entry));
		refreshStatus(ctx);
		const lines = [
			"# /worktree cleanup",
			"",
			`- Removed: ${results.length}`,
			`- Skipped current: ${skipped.length}`,
			"",
			"## Removed",
		];
		for (const result of results) {
			lines.push(`- ${result.metadata.branch}`);
			lines.push(`  path: ${result.metadata.worktreePath}`);
			lines.push(`  purpose: ${result.metadata.purpose}`);
			lines.push(`  note: ${result.note}`);
			lines.push("");
		}
		if (skipped.length > 0) {
			lines.push("## Skipped");
			for (const entry of skipped) {
				lines.push(`- ${entry.branch} — current session is running inside this worktree.`);
			}
		}
		sendReport(pi, lines.join("\n"));
		ctx.ui.notify(`Removed ${results.length} pi-owned worktree${results.length === 1 ? "" : "s"}.`, "info");
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
	}
}

function buildCommandSpec(pi: ExtensionAPI) {
	return {
		description:
			"Inspect or manage git worktrees: /worktree [status|list|open [target]|create <branch> [purpose]|cleanup <target|all>]",
		getArgumentCompletions(prefix: string) {
			const options = ["status", "list", "open", "create", "cleanup"];
			return options.filter((value) => value.startsWith(prefix.trim().toLowerCase())).map((value) => ({ value }));
		},
		handler: async (args: string, ctx: ExtensionContext) => {
			const trimmed = args.trim();
			const [subcommandRaw, ...rest] = trimmed ? trimmed.split(/\s+/) : ["status"];
			const subcommand = (subcommandRaw || "status").toLowerCase();
			const remainder = rest.join(" ").trim();

			if (subcommand === "status") {
				await handleStatus(pi, ctx);
				return;
			}

			if (subcommand === "list") {
				await handleList(pi, ctx);
				return;
			}

			if (subcommand === "open") {
				await handleOpen(pi, remainder, ctx);
				return;
			}

			if (subcommand === "create") {
				await handleCreate(pi, remainder, ctx);
				return;
			}

			if (subcommand === "cleanup") {
				await handleCleanup(pi, remainder, ctx);
				return;
			}

			ctx.ui.notify(
				"Usage: /worktree [status|list|open [target]|create <branch> [purpose]|cleanup <branch|path|id|all>]",
				"warning",
			);
		},
	};
}

export default function worktreeExtension(pi: ExtensionAPI) {
	const spec = buildCommandSpec(pi);
	for (const name of COMMAND_ALIASES) {
		pi.registerCommand(name, spec);
	}

	registerWorktreeTool(pi);
}

// ═══ Tool: worktree ═══

function registerWorktreeTool(pi: ExtensionAPI) {
	const toolInstance = buildPaiInstanceId();

	function toolRefreshStatus(ctx: ExtensionContext): RepoWorktreeContext | null {
		const startedAt = Date.now();
		const snapshot = getRepoWorktreeContext(ctx.cwd);
		if (snapshot?.current?.isManaged) {
			touchManagedWorktreeSeen(snapshot.repoRoot, snapshot.current.path);
		}
		const statusText = currentStatusText(snapshot);
		ctx.ui.setStatus("pi-worktree", statusText);
		recordRuntimeSample("worktree", "event", "tool_status_refresh", Date.now() - startedAt, "worktree");
		return snapshot;
	}

	function _currentStatusText(snapshot: RepoWorktreeContext | null): string | undefined {
		if (!snapshot) {
			return undefined;
		}
		const repo = path.basename(snapshot.repoRoot);
		const branch = snapshot.current?.branch ?? snapshot.currentBranch ?? "detached";
		if (!snapshot.isLinkedWorktree) {
			return undefined;
		}
		if (snapshot.current?.isManaged && snapshot.current.metadata) {
			return `${repo} · pi wt ${branch} · ${snapshot.current.metadata.purpose}`;
		}
		return `${repo} · external wt ${branch}`;
	}

	function formatToolStatus(context: RepoWorktreeContext | null): string {
		if (!context) {
			return "Not inside a git repository.";
		}
		const lines = ["# Worktree status"];
		lines.push(`- Repo: ${path.basename(context.repoRoot)}`);
		lines.push(`- Repo root: ${context.repoRoot}`);
		lines.push(`- Current worktree root: ${context.currentWorktreeRoot}`);
		lines.push(`- Branch: ${context.currentBranch ?? "(detached)"}`);
		lines.push(
			`- Kind: ${context.isLinkedWorktree ? formatWorktreeKind(context.current ?? { isMain: false, isManaged: false }) : "main"}`,
		);
		if (context.current?.isManaged && context.current.metadata) {
			lines.push("- Owned by pi: yes");
			lines.push(`- Purpose: ${context.current.metadata.purpose}`);
			lines.push(`- Owner: ${formatOwnerLabel(context.current.metadata.owner)}`);
		}
		return lines.join("\n");
	}

	function formatToolList(snapshot: RepoWorktreeSnapshot): string {
		const lines = ["# Worktree list"];
		lines.push(`- Repo: ${path.basename(snapshot.repoRoot)}`);
		lines.push(`- Current: ${snapshot.current?.branch ?? snapshot.currentBranch ?? "(detached)"}`);
		lines.push("");
		lines.push("## Worktrees");
		for (const entry of snapshot.worktrees) {
			const kind = entry.isMain ? "[main]" : entry.isManaged ? "[pi-owned]" : "[external]";
			const current = entry.isCurrent ? "[current] " : "";
			lines.push(`- ${current}${kind} ${entry.branch ?? "(detached)"}`);
			lines.push(`  path: ${entry.path}`);
			if (entry.metadata) {
				lines.push(`  purpose: ${entry.metadata.purpose}`);
			}
		}
		if (snapshot.staleManagedWorktrees.length > 0) {
			lines.push("");
			lines.push("## Stale pi metadata");
			for (const entry of snapshot.staleManagedWorktrees) {
				lines.push(`- [stale] ${entry.branch}`);
				lines.push(`  path: ${entry.worktreePath}`);
			}
		}
		return lines.join("\n");
	}

	function formatToolCreateResult(result: {
		repoRoot: string;
		worktreePath: string;
		branch: string;
		createdBranch: boolean;
		metadata: ManagedWorktreeMetadata;
	}): string {
		const lines = ["# Worktree created"];
		lines.push(`- Branch: ${result.branch}`);
		lines.push(`- Path: ${result.worktreePath}`);
		lines.push(`- Repo root: ${result.repoRoot}`);
		lines.push(`- New branch: ${result.createdBranch ? "yes" : "no (attached existing branch)"}`);
		lines.push(`- Purpose: ${result.metadata.purpose}`);
		lines.push(`- Owner: ${formatOwnerLabel(result.metadata.owner)}`);
		return lines.join("\n");
	}

	pi.registerTool({
		name: "worktree",
		label: "Worktree",
		description:
			"Manage git worktrees: create, list, check status, and clean up pi-owned worktrees. Use this tool when you need to create an isolated worktree for parallel work, check which worktree you are in, list available worktrees, or clean up completed worktrees.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("create"),
				Type.Literal("status"),
				Type.Literal("list"),
				Type.Literal("cleanup"),
			]),
			baseRef: Type.Optional(Type.String({ description: "Base ref for the new branch (default: HEAD)" })),
			branch: Type.Optional(Type.String({ description: "Branch name for the worktree (required for create)" })),
			purpose: Type.Optional(Type.String({ description: "Why this worktree exists (required for create)" })),
			target: Type.Optional(Type.String({ description: "Branch name, path, or worktree id for cleanup" })),
		}),
		// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tool handler dispatching to sub-functions
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { action } = params;

			if (action === "create") {
				const branch = params.branch?.trim();
				const purpose = params.purpose?.trim();
				if (!branch) {
					return {
						content: [{ text: "Error: branch is required for create action.", type: "text" as const }],
						isError: true,
					};
				}
				if (!purpose) {
					return {
						content: [{ text: "Error: purpose is required for create action.", type: "text" as const }],
						isError: true,
					};
				}

				try {
					const owner = createOwnerMetadata({
						cwd: ctx.cwd,
						instanceId: toolInstance,
						sessionFile: ctx.sessionManager?.getSessionFile?.() ?? undefined,
						sessionName: typeof pi.getSessionName === "function" ? (pi.getSessionName() ?? undefined) : undefined,
					});
					const result = createManagedWorktree({
						baseRef: params.baseRef?.trim() || undefined,
						branch,
						cwd: ctx.cwd,
						owner,
						purpose,
					});
					toolRefreshStatus(ctx);
					return { content: [{ text: formatToolCreateResult(result), type: "text" as const }] };
				} catch (error) {
					return {
						content: [
							{
								text: `Error creating worktree: ${error instanceof Error ? error.message : String(error)}`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}
			}

			if (action === "status") {
				const context = toolRefreshStatus(ctx);
				if (!context) {
					return { content: [{ text: "Not inside a git repository.", type: "text" as const }], isError: true };
				}
				return { content: [{ text: formatToolStatus(context), type: "text" as const }] };
			}

			if (action === "list") {
				toolRefreshStatus(ctx);
				const snapshot = getRepoWorktreeSnapshot(ctx.cwd);
				if (!snapshot) {
					return { content: [{ text: "Not inside a git repository.", type: "text" as const }], isError: true };
				}
				return { content: [{ text: formatToolList(snapshot), type: "text" as const }] };
			}

			if (action === "cleanup") {
				const target = params.target?.trim();
				if (!target) {
					return {
						content: [
							{
								text: "Error: target is required for cleanup action. Use a branch name, path, or worktree id.",
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				toolRefreshStatus(ctx);
				const snapshot = getRepoWorktreeSnapshot(ctx.cwd);
				if (!snapshot) {
					return { content: [{ text: "Not inside a git repository.", type: "text" as const }], isError: true };
				}

				const managedTargets = findManagedTargets(snapshot, target);
				if (managedTargets.length === 0) {
					const externalMatch = findWorktreeEntry(snapshot, target);
					if (externalMatch && !externalMatch.isManaged) {
						return {
							content: [
								{
									text: `Matched external worktree ${externalMatch.path}. pi only cleans pi-owned worktrees by default.`,
									type: "text" as const,
								},
							],
							isError: true,
						};
					}
					return {
						content: [{ text: `No pi-owned worktree matched: ${target}`, type: "text" as const }],
						isError: true,
					};
				}

				const removable = managedTargets.filter((entry) => entry.worktreePath !== snapshot.currentWorktreeRoot);
				const skipped = managedTargets.filter((entry) => entry.worktreePath === snapshot.currentWorktreeRoot);
				if (removable.length === 0) {
					return {
						content: [
							{
								text: "Refusing to clean up the current worktree. Switch to another checkout first.",
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				try {
					const results = removable.map((entry) => removeManagedWorktree(entry));
					toolRefreshStatus(ctx);
					const lines = [
						"# Worktree cleanup",
						"",
						`Removed: ${results.length}`,
						`Skipped current: ${skipped.length}`,
						"",
						"## Removed",
					];
					for (const result of results) {
						lines.push(`- ${result.metadata.branch}`);
						lines.push(`  path: ${result.metadata.worktreePath}`);
						lines.push(`  purpose: ${result.metadata.purpose}`);
					}
					return { content: [{ text: lines.join("\n"), type: "text" as const }] };
				} catch (error) {
					return {
						content: [
							{
								text: `Error cleaning up worktree: ${error instanceof Error ? error.message : String(error)}`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}
			}

			return {
				content: [{ text: "Unknown action. Use: create, status, list, or cleanup.", type: "text" as const }],
				isError: true,
			};
		},

		renderCall(args, theme) {
			const action = args.action ?? "?";
			const detail =
				action === "create" ? `${args.branch ?? "?"}` : action === "cleanup" ? `${args.target ?? "?"}` : "";
			return new Text(`${theme.fg("toolTitle", theme.bold("⌥ worktree"))} ${action} ${detail}`, 0, 0);
		},

		renderResult(result, _options, theme) {
			const text =
				result.content?.find((e): e is { type: "text"; text: string } => typeof e === "object" && e?.type === "text")
					?.text ?? "";
			if (result.isError) {
				return new Text(theme.fg("error", text), 0, 0);
			}
			const firstLine = text.split("\n")[0] ?? "";
			return new Text(`${theme.fg("success", "✓ ")}${theme.fg("muted", firstLine)}`, 0, 0);
		},
	});
}
