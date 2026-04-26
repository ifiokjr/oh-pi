import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { buildCompletionKey, markSeenWithTtl } from "./completion-dedupe.js";
import { createFileCoalescer } from "./file-coalescer.js";
import { renderWidget } from "./render.js";
import { POLL_INTERVAL_MS, RESULTS_DIR } from './types.js';
import type { AsyncJobState } from './types.js';
import { readStatus } from "./utils.js";

interface RuntimeMonitorOptions {
	pi: ExtensionAPI;
	asyncJobs: Map<string, AsyncJobState>;
	getBaseCwd: () => string;
	getCurrentSessionId: () => string | null;
	getLastUiContext: () => ExtensionContext | null;
	getSafeModeEnabled: () => boolean;
}

export function createSubagentRuntimeMonitor(options: RuntimeMonitorOptions) {
	let poller: NodeJS.Timeout | null = null;
	const completionSeen = new Map<string, number>();
	const completionTtlMs = 10 * 60 * 1000;
	let watcher: fs.FSWatcher | null = null;
	let watcherRestartTimer: ReturnType<typeof setTimeout> | null = null;

	const refreshWidget = () => {
		const lastUiContext = options.getLastUiContext();
		if (!lastUiContext?.hasUI) {
			return;
		}
		renderWidget(lastUiContext, [...options.asyncJobs.values()], {
			suppressed: options.getSafeModeEnabled(),
		});
	};

	const ensurePoller = () => {
		if (poller) {
			return;
		}
		poller = setInterval(() => {
			const lastUiContext = options.getLastUiContext();
			if (!lastUiContext || !lastUiContext.hasUI) {
				return;
			}
			if (options.getSafeModeEnabled()) {
				renderWidget(lastUiContext, [], { suppressed: true });
				return;
			}
			if (options.asyncJobs.size === 0) {
				renderWidget(lastUiContext, []);
				clearInterval(poller);
				poller = null;
				return;
			}

			for (const job of options.asyncJobs.values()) {
				if (job.status === "complete" || job.status === "failed") {
					continue;
				}
				const status = readStatus(job.asyncDir);
				if (status) {
					job.status = status.state;
					job.mode = status.mode;
					job.currentStep = status.currentStep ?? job.currentStep;
					job.stepsTotal = status.steps?.length ?? job.stepsTotal;
					job.startedAt = status.startedAt ?? job.startedAt;
					job.updatedAt = status.lastUpdate ?? Date.now();
					if (status.steps?.length) {
						job.agents = status.steps.map((step) => step.agent);
					}
					job.sessionDir = status.sessionDir ?? job.sessionDir;
					job.outputFile = status.outputFile ?? job.outputFile;
					job.totalTokens = status.totalTokens ?? job.totalTokens;
					job.sessionFile = status.sessionFile ?? job.sessionFile;
				} else {
					job.status = job.status === "queued" ? "running" : job.status;
					job.updatedAt = Date.now();
				}
			}

			refreshWidget();
		}, POLL_INTERVAL_MS);
		poller.unref?.();
	};

	const handleResult = (file: string) => {
		const resultPath = path.join(RESULTS_DIR, file);
		if (!fs.existsSync(resultPath)) {
			return;
		}
		try {
			const data = JSON.parse(fs.readFileSync(resultPath, "utf8"));
			if (data.sessionId && data.sessionId !== options.getCurrentSessionId()) {
				return;
			}
			if (!data.sessionId && data.cwd && data.cwd !== options.getBaseCwd()) {
				return;
			}
			const now = Date.now();
			const completionKey = buildCompletionKey(data, `result:${file}`);
			if (markSeenWithTtl(completionSeen, completionKey, now, completionTtlMs)) {
				try {
					fs.unlinkSync(resultPath);
				} catch {}
				return;
			}
			options.pi.events.emit("subagent:complete", data);
			fs.unlinkSync(resultPath);
		} catch {}
	};

	const resultFileCoalescer = createFileCoalescer(handleResult, 50);

	function startResultWatcher(): void {
		watcherRestartTimer = null;
		try {
			watcher = fs.watch(RESULTS_DIR, (event, file) => {
				if (event !== "rename" || !file) {
					return;
				}
				const fileName = file.toString();
				if (!fileName.endsWith(".json")) {
					return;
				}
				resultFileCoalescer.schedule(fileName);
			});
			watcher.on("error", () => {
				watcher = null;
				watcherRestartTimer = setTimeout(() => {
					try {
						fs.mkdirSync(RESULTS_DIR, { recursive: true });
						startResultWatcher();
					} catch {}
				}, 3000);
			});
			watcher.unref?.();
		} catch {
			watcher = null;
			watcherRestartTimer = setTimeout(() => {
				try {
					fs.mkdirSync(RESULTS_DIR, { recursive: true });
					startResultWatcher();
				} catch {}
			}, 3000);
		}
	}

	startResultWatcher();
	fs.readdirSync(RESULTS_DIR)
		.filter((file) => file.endsWith(".json"))
		.forEach((file) => resultFileCoalescer.schedule(file, 0));

	const stop = () => {
		watcher?.close();
		if (watcherRestartTimer) {
			clearTimeout(watcherRestartTimer);
		}
		watcherRestartTimer = null;
		if (poller) {
			clearInterval(poller);
		}
		poller = null;
		resultFileCoalescer.clear();
	};

	return {
		clearResults() {
			resultFileCoalescer.clear();
		},
		ensurePoller,
		refreshWidget,
		stop,
	};
}
