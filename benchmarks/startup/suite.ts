import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import type { BenchmarkDefinition } from "../shared/benchmark";
import { createBenchmarkHarness } from "./harness";

interface ExtensionModule {
	default: (pi: any) => void;
}

interface ManifestExtensionEntry {
	id: string;
	path: string;
	module: ExtensionModule;
}

interface StartupBenchmarkSuite {
	definitions: BenchmarkDefinition[];
	cleanup: () => Promise<void>;
}

type SchedulerExports = typeof import("../../packages/extensions/extensions/scheduler.js");
type WorktreeExports = typeof import("../../packages/extensions/extensions/worktree-shared.js");
type CustomFooterExports = typeof import("../../packages/extensions/extensions/custom-footer.js");

const ROOT_PACKAGE_PATH = path.resolve(process.cwd(), "package.json");
const TEMP_ROOT_CLEANUP_RETRY_DELAYS_MS = [0, 25, 50, 100] as const;

function createAssistantEntry(index: number) {
	return {
		message: {
			content: `assistant message ${index}`,
			role: "assistant",
			usage: {
				cost: { total: 0.01 },
				input: 1200 + (index % 11),
				output: 800 + (index % 7),
			},
		},
		type: "message",
	};
}

function createAssistantEntries(count: number): any[] {
	return Array.from({ length: count }, (_, index) => createAssistantEntry(index));
}

function buildSchedulerTask(index: number, now: number) {
	return {
		createdAt: now - index * 1_000,
		creatorInstanceId: `creator-${index}`,
		creatorSessionId: `creator-session-${index}`,
		enabled: true,
		id: `task-${index}`,
		intervalMs: index % 2 === 0 ? undefined : 300_000,
		jitterMs: 0,
		kind: index % 2 === 0 ? "once" : "recurring",
		nextRunAt: now + index * 60_000,
		ownerInstanceId: `owner-${index}`,
		ownerSessionId: `session-${index}`,
		pending: false,
		prompt: `Follow up on benchmark task ${index}`,
		runCount: 0,
		scope: "instance",
	};
}

function writeSchedulerStore(tasks: unknown[]) {
	return JSON.stringify(
		{
			tasks,
			version: 1,
		},
		null,
		"\t",
	);
}

function git(cwd: string, args: string[]): string {
	return execFileSync("git", ["-C", cwd, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

async function createTempGitRepo(rootDir: string): Promise<string> {
	const repoDir = path.join(rootDir, "repo");
	await fs.mkdir(repoDir, { recursive: true });
	git(repoDir, ["init", "--initial-branch", "main"]);
	await fs.writeFile(path.join(repoDir, "README.md"), "# benchmark\n", "utf8");
	git(repoDir, ["add", "README.md"]);
	git(repoDir, [
		"-c",
		"user.name=Benchmark Bot",
		"-c",
		"user.email=benchmark@example.com",
		"commit",
		"-m",
		"chore: seed benchmark repo",
	]);
	return repoDir;
}

function extensionIdFromPath(extensionPath: string): string {
	const normalizedPath = extensionPath.replaceAll(/\\/g, "/");
	const fileName = normalizedPath.split("/").at(-1) ?? normalizedPath;
	if (fileName === "index.ts") {
		return normalizedPath.split("/").at(-2) ?? "unknown";
	}
	return fileName.replace(/\.ts$/, "");
}

export function parseBenchmarkEnvList(rawValue: string | undefined): Set<string> | null {
	if (rawValue === undefined) {
		return null;
	}

	const trimmedValue = rawValue.trim();
	if (trimmedValue === "all") {
		return null;
	}

	if (trimmedValue === "") {
		return new Set();
	}

	return new Set(
		trimmedValue
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	);
}

function parseEnvList(name: string): Set<string> | null {
	return parseBenchmarkEnvList(process.env[name]);
}

function parseExtensionFilter(): Set<string> | null {
	return parseEnvList("OH_PI_BENCH_EXTENSION_FILTER");
}

function parseFocusedBenchmarkFilter(): Set<string> | null {
	return parseEnvList("OH_PI_BENCH_FOCUSED_FILTER");
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeDirectoryWithRetry(targetPath: string): Promise<void> {
	let lastError: unknown;
	for (const delayMs of TEMP_ROOT_CLEANUP_RETRY_DELAYS_MS) {
		if (delayMs > 0) {
			await sleep(delayMs);
		}

		try {
			await fs.rm(targetPath, { force: true, maxRetries: 3, recursive: true, retryDelay: 25 });
			return;
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError;
}

async function loadManifestExtensionEntries(): Promise<ManifestExtensionEntry[]> {
	const rawPackage = JSON.parse(await fs.readFile(ROOT_PACKAGE_PATH, "utf8")) as {
		pi?: { extensions?: string[] };
	};
	const extensionPaths = rawPackage.pi?.extensions ?? [];
	const entries: ManifestExtensionEntry[] = [];

	for (const extensionPath of extensionPaths) {
		const resolvedPath = path.resolve(process.cwd(), extensionPath.replace(/\.ts$/, ".js"));
		entries.push({
			id: extensionIdFromPath(extensionPath),
			module: (await import(pathToFileURL(resolvedPath).href)) as ExtensionModule,
			path: extensionPath,
		});
	}

	return entries;
}

export async function createStartupBenchmarkSuite(): Promise<StartupBenchmarkSuite> {
	const previousHome = process.env.HOME;
	const previousUserProfile = process.env.USERPROFILE;
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oh-pi-startup-bench-"));
	const tempHome = path.join(tempRoot, "home");
	await fs.mkdir(tempHome, { recursive: true });
	process.env.HOME = tempHome;
	process.env.USERPROFILE = tempHome;

	const schedulerWorkspace = path.join(tempRoot, "scheduler-workspace");
	await fs.mkdir(schedulerWorkspace, { recursive: true });

	const extensionFilter = parseExtensionFilter();
	const focusedBenchmarkFilter = parseFocusedBenchmarkFilter();
	const manifestEntries = await loadManifestExtensionEntries();
	const filteredManifestEntries = extensionFilter
		? manifestEntries.filter((entry) => extensionFilter.has(entry.id))
		: manifestEntries;

	const schedulerModule = (await import("../../packages/extensions/extensions/scheduler.js")) as SchedulerExports;
	const worktreeModule = (await import("../../packages/extensions/extensions/worktree-shared.js")) as WorktreeExports;
	const customFooterModule =
		(await import("../../packages/extensions/extensions/custom-footer.js")) as CustomFooterExports;
	const usageTrackerModule = (await import("../../packages/extensions/extensions/usage-tracker.js")) as ExtensionModule;

	const now = Date.now();
	const schedulerTasks = Array.from({ length: 50 }, (_, index) => buildSchedulerTask(index, now));
	await fs.mkdir(path.dirname(schedulerModule.getSchedulerStoragePath(schedulerWorkspace)), { recursive: true });
	await fs.writeFile(
		schedulerModule.getSchedulerStoragePath(schedulerWorkspace),
		writeSchedulerStore(schedulerTasks),
		"utf8",
	);

	const repoDir = await createTempGitRepo(tempRoot);
	const fullStackNearThresholdEntries = createAssistantEntries(200);
	const customFooterLargeEntries = createAssistantEntries(50_000);
	const theme = {
		fg: (_color: string, text: string) => text,
	};

	const baselineDefinitions: BenchmarkDefinition[] = [
		{
			budget: { medianMs: 900, p95Ms: 1_400 },
			group: "startup",
			id: "full-stack-register-start-empty",
			iterations: 5,
			label: "full stack register + session_start (empty history)",
			minSampleTimeMs: 50,
			note: "Loads every default oh-pi extension from package.json and fires the first session_start.",
			async run() {
				vi.resetModules();
				const harness = createBenchmarkHarness({ cwd: repoDir, entries: [], branch: [] });
				for (const entry of manifestEntries) {
					entry.module.default(harness.pi as never);
				}
				await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
				await harness.emitAsync("session_shutdown", { type: "session_shutdown" }, harness.ctx);
			},
			warmupIterations: 1,
		},
		{
			budget: { medianMs: 1_200, p95Ms: 1_800 },
			group: "startup",
			id: "full-stack-register-start-near-threshold",
			iterations: 5,
			label: "full stack register + session_start (200-entry history)",
			minSampleTimeMs: 50,
			note: "Exercises eager history scans that still happen below the 250-entry defer thresholds.",
			async run() {
				vi.resetModules();
				const harness = createBenchmarkHarness({
					cwd: repoDir,
					entries: fullStackNearThresholdEntries,
					branch: fullStackNearThresholdEntries,
				});
				for (const entry of manifestEntries) {
					entry.module.default(harness.pi as never);
				}
				await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
				await harness.emitAsync("session_shutdown", { type: "session_shutdown" }, harness.ctx);
			},
			warmupIterations: 1,
		},
	];

	const targetedDefinitions: BenchmarkDefinition[] = [
		{
			budget: { medianMs: 40, p95Ms: 80 },
			group: "focused hotspot",
			id: "scheduler-runtime-context-with-store",
			iterations: 25,
			label: "scheduler persisted store load (50 tasks)",
			minSampleTimeMs: 20,
			note: "Measures the synchronous loadTasksFromDisk path behind scheduler session_start wiring.",
			run() {
				const runtime = new schedulerModule.SchedulerRuntime({ events: { emit() {} } } as never);
				runtime.setRuntimeContext({
					cwd: schedulerWorkspace,
					hasUI: false,
					sessionManager: {
						getSessionId: () => "session-1",
						getSessionFile: () => "session.jsonl",
					},
					ui: { setStatus() {} },
				} as never);
			},
			warmupIterations: 1,
		},
		{
			budget: { medianMs: 90, p95Ms: 130 },
			group: "focused hotspot",
			id: "custom-footer-usage-scan-large-history",
			iterations: 20,
			label: "custom footer usage scan (50k messages)",
			minSampleTimeMs: 20,
			note: "Tracks the O(n) footer usage aggregation path that can surface during startup and redraws.",
			run() {
				customFooterModule.collectFooterUsageTotals({
					sessionManager: {
						getBranch: () => customFooterLargeEntries,
					},
				} as never);
			},
			warmupIterations: 1,
		},
		{
			budget: { medianMs: 120, p95Ms: 200 },
			group: "focused hotspot",
			id: "usage-tracker-session-start-near-threshold",
			iterations: 20,
			label: "usage tracker session_start (200-entry history)",
			minSampleTimeMs: 20,
			note: "Covers session hydration plus widget setup before the defer threshold kicks in.",
			async run() {
				const harness = createBenchmarkHarness({
					cwd: repoDir,
					entries: fullStackNearThresholdEntries,
					branch: fullStackNearThresholdEntries,
				});
				usageTrackerModule.default(harness.pi as never);
				await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
				await harness.emitAsync("session_shutdown", { type: "session_shutdown" }, harness.ctx);
			},
			warmupIterations: 1,
		},
		{
			budget: { medianMs: 120, p95Ms: 200 },
			group: "focused hotspot",
			id: "worktree-context-temp-repo",
			iterations: 20,
			label: "worktree current context (single temp repo)",
			note: "Measures the lightweight current-worktree probe used by footer and status refreshes.",
			run() {
				worktreeModule.getRepoWorktreeContext(repoDir);
			},
			warmupIterations: 2,
		},
		{
			budget: { medianMs: 700 },
			group: "focused hotspot",
			id: "worktree-snapshot-temp-repo",
			iterations: 20,
			label: "worktree snapshot (single temp repo)",
			note: "Measures the synchronous full worktree inventory path used by /worktree reporting and explicit status overlays.",
			run() {
				worktreeModule.getRepoWorktreeSnapshot(repoDir);
			},
			warmupIterations: 1,
		},
		{
			budget: { medianMs: 30, p95Ms: 50 },
			group: "render",
			id: "custom-footer-first-render",
			iterations: 20,
			label: "custom footer first render (200-entry history)",
			minSampleTimeMs: 20,
			note: "Simulates the first footer mount after startup so UI formatting regressions show up in CI.",
			async run() {
				const harness = createBenchmarkHarness({
					cwd: repoDir,
					entries: fullStackNearThresholdEntries,
					branch: fullStackNearThresholdEntries,
					contextUsage: { percent: 42 },
				});
				customFooterModule.default(harness.pi as never);
				await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

				const footerFactory = harness.footerFactory;
				if (typeof footerFactory !== "function") {
					throw new Error("Expected custom-footer to register a footer factory.");
				}

				const component = footerFactory({ requestRender() {} }, theme, {
					onBranchChange: () => () => undefined,
					getGitBranch: () => "main",
				});
				component.render(200);
				component.dispose?.();
				await harness.emitAsync("session_shutdown", { type: "session_shutdown" }, harness.ctx);
			},
			warmupIterations: 1,
		},
	].filter((definition) => !focusedBenchmarkFilter || focusedBenchmarkFilter.has(definition.id));

	const definitions: BenchmarkDefinition[] = [...baselineDefinitions, ...targetedDefinitions];

	for (const entry of filteredManifestEntries) {
		definitions.push({
			budget: { medianMs: 800, p95Ms: 1_000 },
			group: "extension startup",
			id: `extension-startup-${entry.id}`,
			iterations: 10,
			label: `isolated extension startup (${entry.id})`,
			minSampleTimeMs: 20,
			note: `Loads only ${entry.id} (${entry.path}) and fires session_start/session_shutdown for focused regression tracking.`,
			async run() {
				const harness = createBenchmarkHarness({
					cwd: repoDir,
					entries: fullStackNearThresholdEntries,
					branch: fullStackNearThresholdEntries,
					contextUsage: { percent: 42 },
				});
				entry.module.default(harness.pi as never);
				await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
				await harness.emitAsync("session_shutdown", { type: "session_shutdown" }, harness.ctx);
			},
			warmupIterations: 1,
		});
	}

	return {
		async cleanup() {
			if (previousHome === undefined) {
				process.env.HOME = undefined;
			} else {
				process.env.HOME = previousHome;
			}

			if (previousUserProfile === undefined) {
				process.env.USERPROFILE = undefined;
			} else {
				process.env.USERPROFILE = previousUserProfile;
			}

			await removeDirectoryWithRetry(tempRoot);
		},
		definitions,
	};
}
