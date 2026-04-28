import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { createBenchmarkHarness } from "../startup/harness";

interface ExtensionModule {
	default: (pi: any) => void;
}

interface RuntimeExtensionEntry {
	id: string;
	path: string;
	resolvedPath: string;
}

interface RuntimeChurnResult {
	id: string;
	label: string;
	group: "runtime idle" | "runtime scaling";
	windowMs: number;
	mountedWidgets: number;
	mountedFooter: boolean;
	widgetRenderRequests: number;
	footerRenderRequests: number;
	statusUpdates: number;
	notifications: number;
	note?: string;
}

interface RuntimeChurnReport {
	suite: string;
	generatedAt: string;
	windowMs: number;
	results: RuntimeChurnResult[];
}

interface RuntimeBenchmarkSuite {
	report: RuntimeChurnReport;
	cleanup: () => Promise<void>;
}

const ROOT_PACKAGE_PATH = path.resolve(process.cwd(), "package.json");
const WINDOW_MS = 65_000;
const FULL_STACK_ENTRIES = 200;

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

function extensionIdFromPath(extensionPath: string): string {
	const normalizedPath = extensionPath.replaceAll(/\\/g, "/");
	const fileName = normalizedPath.split("/").at(-1) ?? normalizedPath;
	if (fileName === "index.ts") {
		return normalizedPath.split("/").at(-2) ?? "unknown";
	}
	return fileName.replace(/\.ts$/, "");
}

function parseExtensionFilter(): Set<string> | null {
	const rawValue = process.env.OH_PI_BENCH_EXTENSION_FILTER?.trim();
	if (!rawValue || rawValue === "all") {
		return null;
	}

	return new Set(
		rawValue
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	);
}

async function loadManifestExtensionEntries(): Promise<RuntimeExtensionEntry[]> {
	const rawPackage = JSON.parse(await fs.readFile(ROOT_PACKAGE_PATH, "utf8")) as {
		pi?: { extensions?: string[] };
	};
	const extensionPaths = rawPackage.pi?.extensions ?? [];
	return extensionPaths.map((extensionPath) => ({
		id: extensionIdFromPath(extensionPath),
		path: extensionPath,
		resolvedPath: path.resolve(process.cwd(), extensionPath.replace(/\.ts$/, ".js")),
	}));
}

function importExtensionModule(entry: RuntimeExtensionEntry, instanceId: string): Promise<ExtensionModule> {
	return import(
		`${pathToFileURL(entry.resolvedPath).href}?bench=${encodeURIComponent(instanceId)}`
	) as Promise<ExtensionModule>;
}

function toPerMinute(count: number, windowMs: number): number {
	return Number(((count * 60_000) / windowMs).toFixed(2));
}

function toMarkdown(report: RuntimeChurnReport): string {
	const lines = [
		`# ${report.suite} benchmark report`,
		"",
		`- Generated: ${report.generatedAt}`,
		`- Window: ${report.windowMs}ms`,
		"",
		"| Scenario | Group | Mounted UI | Widget renders/min | Footer renders/min | Status writes/min | Notifications/min |",
		"| --- | --- | --- | ---: | ---: | ---: | ---: |",
	];

	for (const result of report.results) {
		const mountedUi =
			[
				result.mountedWidgets > 0 ? `${result.mountedWidgets} widget${result.mountedWidgets === 1 ? "" : "s"}` : null,
				result.mountedFooter ? "footer" : null,
			]
				.filter(Boolean)
				.join(" + ") || "none";

		lines.push(
			`| ${result.label} | ${result.group} | ${mountedUi} | ${toPerMinute(
				result.widgetRenderRequests,
				result.windowMs,
			).toFixed(2)} | ${toPerMinute(result.footerRenderRequests, result.windowMs).toFixed(
				2,
			)} | ${toPerMinute(result.statusUpdates, result.windowMs).toFixed(2)} | ${toPerMinute(
				result.notifications,
				result.windowMs,
			).toFixed(2)} |`,
		);

		if (result.note) {
			lines.push(`| ↳ note |  |  |  |  |  | ${result.note} |`);
		}
	}

	return `${lines.join("\n")}\n`;
}

async function writeRuntimeChurnReport(report: RuntimeChurnReport, outputDir: string): Promise<void> {
	await fs.mkdir(outputDir, { recursive: true });
	await fs.writeFile(path.join(outputDir, "runtime-churn.json"), `${JSON.stringify(report, null, "\t")}\n`, "utf8");
	await fs.writeFile(path.join(outputDir, "runtime-churn.md"), toMarkdown(report), "utf8");
}

async function captureRuntimeChurn(
	entries: RuntimeExtensionEntry[],
	options: {
		label: string;
		id: string;
		group: RuntimeChurnResult["group"];
		note?: string;
		instanceCount?: number;
		windowMs?: number;
	},
): Promise<RuntimeChurnResult> {
	const windowMs = options.windowMs ?? WINDOW_MS;
	const historyEntries = createAssistantEntries(FULL_STACK_ENTRIES);
	const harnesses = [];

	for (let index = 0; index < (options.instanceCount ?? 1); index++) {
		vi.resetModules();
		const harness = createBenchmarkHarness({
			branch: historyEntries,
			contextUsage: { percent: 42 },
			cwd: process.cwd(),
			entries: historyEntries,
			hasUI: true,
		});
		for (const entry of entries) {
			const mod = await importExtensionModule(
				entry,
				`${options.id}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
			);
			mod.default(harness.pi as never);
		}
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
		harness.mountWidgets();
		harness.mountFooter();
		harnesses.push(harness);
	}

	await vi.advanceTimersByTimeAsync(windowMs);

	const result: RuntimeChurnResult = {
		footerRenderRequests: harnesses.reduce((total, harness) => total + harness.requestRenderCounts.footer, 0),
		group: options.group,
		id: options.id,
		label: options.label,
		mountedFooter: harnesses.some((harness) => Boolean(harness.footerFactory)),
		mountedWidgets: harnesses.reduce((total, harness) => total + harness.widgets.size, 0),
		note: options.note,
		notifications: harnesses.reduce((total, harness) => total + harness.notifications.length, 0),
		statusUpdates: harnesses.reduce((total, harness) => total + harness.statusCalls.length, 0),
		widgetRenderRequests: harnesses.reduce((total, harness) => total + harness.requestRenderCounts.widget, 0),
		windowMs,
	};

	for (const harness of harnesses) {
		harness.disposeMounted();
		await harness.emitAsync("session_shutdown", { type: "session_shutdown" }, harness.ctx);
	}

	vi.clearAllTimers();
	return result;
}

export async function createRuntimeBenchmarkSuite(): Promise<RuntimeBenchmarkSuite> {
	const previousHome = process.env.HOME;
	const previousUserProfile = process.env.USERPROFILE;
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oh-pi-runtime-bench-"));
	const tempHome = path.join(tempRoot, "home");
	await fs.mkdir(tempHome, { recursive: true });
	process.env.HOME = tempHome;
	process.env.USERPROFILE = tempHome;

	const extensionFilter = parseExtensionFilter();
	const manifestEntries = await loadManifestExtensionEntries();
	const filteredEntries = extensionFilter
		? manifestEntries.filter((entry) => extensionFilter.has(entry.id))
		: manifestEntries;
	const fullStackEntries = manifestEntries;

	const results: RuntimeChurnResult[] = [];

	results.push(
		await captureRuntimeChurn(fullStackEntries, {
			group: "runtime idle",
			id: "full-stack-idle-ui",
			label: "full stack mounted idle UI churn",
			note: "Loads the active extension set, mounts widgets/footers, and advances a 65s idle window.",
		}),
	);

	results.push(
		await captureRuntimeChurn(fullStackEntries, {
			group: "runtime scaling",
			id: "full-stack-idle-ui-4x",
			instanceCount: 4,
			label: "full stack mounted idle UI churn (4 instances)",
			note: "Approximates multiple active pi instances by mounting four copies of the active extension set under the same fake clock window.",
		}),
	);

	for (const entry of filteredEntries) {
		results.push(
			await captureRuntimeChurn([entry], {
				group: "runtime idle",
				id: `extension-runtime-idle-${entry.id}`,
				label: `isolated runtime idle UI churn (${entry.id})`,
				note: `Loads only ${entry.id} (${entry.path}) so always-on timers and redraws can be ranked in isolation.`,
			}),
		);
	}

	const report: RuntimeChurnReport = {
		generatedAt: new Date().toISOString(),
		results: [
			...results.filter((result) => result.group === "runtime scaling"),
			...results
				.filter((result) => result.group === "runtime idle")
				.sort(
					(left, right) =>
						right.widgetRenderRequests +
							right.footerRenderRequests -
							(left.widgetRenderRequests + left.footerRenderRequests) || left.label.localeCompare(right.label),
				),
		],
		suite: "runtime-churn",
		windowMs: WINDOW_MS,
	};

	const outputDir = path.resolve(process.cwd(), process.env.OH_PI_BENCH_OUTPUT_DIR ?? "coverage/benchmarks/runtime");
	await writeRuntimeChurnReport(report, outputDir);

	return {
		async cleanup() {
			vi.clearAllTimers();
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

			await fs.rm(tempRoot, { recursive: true, force: true });
		},
		report,
	};
}
