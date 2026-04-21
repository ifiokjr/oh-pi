import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const DIAGNOSTIC_WINDOW_MS = 2 * 60_000;
const SAMPLE_LIMIT = 64;
const INSTALL_SYMBOL = Symbol.for("oh-pi.watchdog-runtime-diagnostics.installed");

type RuntimeChannel = "event" | "tool" | "command";
type UiActivityKind = "status" | "notify" | "overlay" | "widget" | "footer";

type RuntimeSample = {
	name: string;
	durationMs: number;
	timestamp: number;
};

type RuntimeProfile = {
	extensionId: string;
	source: string;
	registrations: {
		events: Set<string>;
		tools: Set<string>;
		commands: Set<string>;
		shortcuts: Set<string>;
	};
	eventSamples: RuntimeSample[];
	toolSamples: RuntimeSample[];
	commandSamples: RuntimeSample[];
	ui: Record<UiActivityKind, number[]>;
	metric: RuntimeDiagnosticsMetric;
};

export type RuntimeDiagnosticsMetric = {
	extensionId: string;
	source?: string;
	pendingTasks?: number;
	dueTasks?: number;
	activeTasks?: number;
	mode?: string;
	note?: string;
	timestamp?: number;
};

export type ExtensionDiagnostic = {
	extensionId: string;
	source: string;
	score: number;
	recentHandlerMs: number;
	recentStatusUpdates: number;
	recentNotifications: number;
	recentOverlays: number;
	pendingTasks: number;
	dueTasks: number;
	reasons: string[];
};

export type StartupDiagnostic = {
	extensionId: string;
	source: string;
	totalMs: number;
	lastMs: number;
	count: number;
	latestAt: number | null;
};

export const RUNTIME_DIAGNOSTICS_EVENT = "oh-pi:runtime-diagnostics:metric";

const profiles = new Map<string, RuntimeProfile>();
const wrappedContextCache = new WeakMap<object, Map<string, unknown>>();

function pushBounded<T>(items: T[], item: T, limit = SAMPLE_LIMIT): void {
	items.push(item);
	if (items.length > limit * 2) {
		items.copyWithin(0, items.length - limit);
		items.length = limit;
	}
}

function pruneTimestamps(items: number[], now: number): void {
	const cutoff = now - DIAGNOSTIC_WINDOW_MS;
	let firstValid = 0;
	while (firstValid < items.length && items[firstValid] < cutoff) {
		firstValid += 1;
	}
	if (firstValid <= 0) {
		return;
	}
	// For small prunes, splice is fine; for large ones, use copyWithin
	if (firstValid <= 4) {
		items.splice(0, firstValid);
		return;
	}
	items.copyWithin(0, firstValid);
	items.length = items.length - firstValid;
}

function profileSourceToId(source: string): string {
	const ext = path.extname(source);
	const base = path.basename(source, ext);
	if (base !== "index") {
		return base || "unknown";
	}

	const parts = source.split(path.sep).filter(Boolean);
	for (let index = parts.length - 2; index >= 0; index--) {
		const candidate = parts[index];
		if (candidate !== "extensions" && candidate !== "extension") {
			return candidate;
		}
	}

	return "unknown";
}

/** Compiled once at module scope — not re-created per stack walk. */
const STACK_FILE_RE = /((?:file:\/\/)?[^\s)]+\.(?:ts|js))/;

function inferExtensionSourceFromStack(stack = new Error().stack): string {
	const lines = stack?.split("\n") ?? [];
	for (const line of lines) {
		if (line.includes("watchdog-runtime-diagnostics")) {
			continue;
		}
		const match = STACK_FILE_RE.exec(line);
		const rawPath = match?.[1];
		if (!rawPath) {
			continue;
		}
		const normalized = rawPath.replace(/^file:\/\//, "");
		if (
			normalized.includes(`${path.sep}packages${path.sep}`) ||
			normalized.includes(`${path.sep}.pi${path.sep}extensions${path.sep}`)
		) {
			return normalized;
		}
	}
	return "unknown";
}

function ensureProfile(extensionId: string, source = extensionId): RuntimeProfile {
	const existing = profiles.get(extensionId);
	if (existing) {
		if (existing.source === "unknown" && source !== "unknown") {
			existing.source = source;
		}
		return existing;
	}

	const profile: RuntimeProfile = {
		extensionId,
		source,
		registrations: {
			events: new Set<string>(),
			tools: new Set<string>(),
			commands: new Set<string>(),
			shortcuts: new Set<string>(),
		},
		eventSamples: [],
		toolSamples: [],
		commandSamples: [],
		ui: {
			status: [],
			notify: [],
			overlay: [],
			widget: [],
			footer: [],
		},
		metric: { extensionId, source },
	};
	profiles.set(extensionId, profile);
	return profile;
}

function recentDuration(samples: RuntimeSample[], since: number): number {
	let total = 0;
	for (const sample of samples) {
		if (sample.timestamp >= since) {
			total += sample.durationMs;
		}
	}
	return total;
}

function recentCount(items: number[], since: number): number {
	let total = 0;
	for (const timestamp of items) {
		if (timestamp >= since) {
			total += 1;
		}
	}
	return total;
}

function noteRegistration(
	extensionId: string,
	source: string,
	kind: keyof RuntimeProfile["registrations"],
	name: string,
): void {
	ensureProfile(extensionId, source).registrations[kind].add(name);
}

export function recordRuntimeSample(
	extensionId: string,
	channel: RuntimeChannel,
	name: string,
	durationMs: number,
	source = extensionId,
	timestamp = Date.now(),
): void {
	const profile = ensureProfile(extensionId, source);
	const sample: RuntimeSample = { name, durationMs: Math.max(0, durationMs), timestamp };

	if (channel === "event") {
		pushBounded(profile.eventSamples, sample);
		return;
	}

	if (channel === "tool") {
		pushBounded(profile.toolSamples, sample);
		return;
	}

	pushBounded(profile.commandSamples, sample);
}

export function recordRuntimeUiActivity(
	extensionId: string,
	kind: UiActivityKind,
	source = extensionId,
	timestamp = Date.now(),
): void {
	const profile = ensureProfile(extensionId, source);
	pushBounded(profile.ui[kind], timestamp);
}

export function recordRuntimeMetric(metric: RuntimeDiagnosticsMetric): void {
	const timestamp = metric.timestamp ?? Date.now();
	const profile = ensureProfile(metric.extensionId, metric.source ?? metric.extensionId);
	profile.metric = {
		...profile.metric,
		...metric,
		timestamp,
	};
}

export function getExtensionDiagnostics(now = Date.now()): ExtensionDiagnostic[] {
	const since = now - DIAGNOSTIC_WINDOW_MS;
	const diagnostics: ExtensionDiagnostic[] = [];

	for (const profile of profiles.values()) {
		pruneTimestamps(profile.ui.status, now);
		pruneTimestamps(profile.ui.notify, now);
		pruneTimestamps(profile.ui.overlay, now);
		pruneTimestamps(profile.ui.widget, now);
		pruneTimestamps(profile.ui.footer, now);

		const recentHandlerMs =
			recentDuration(profile.eventSamples, since) +
			recentDuration(profile.toolSamples, since) +
			recentDuration(profile.commandSamples, since);
		const recentStatusUpdates = recentCount(profile.ui.status, since);
		const recentNotifications = recentCount(profile.ui.notify, since);
		const recentOverlays = recentCount(profile.ui.overlay, since);
		const pendingTasks = profile.metric.pendingTasks ?? 0;
		const dueTasks = profile.metric.dueTasks ?? 0;

		const score =
			recentHandlerMs +
			recentStatusUpdates * 18 +
			recentNotifications * 30 +
			recentOverlays * 40 +
			pendingTasks * 10 +
			dueTasks * 18;
		if (score <= 0) {
			continue;
		}

		const reasons: string[] = [];
		if (recentHandlerMs > 0) {
			reasons.push(`${Math.round(recentHandlerMs)}ms recent handler time`);
		}

		if (recentStatusUpdates > 0) {
			reasons.push(`${recentStatusUpdates} status updates`);
		}

		if (recentNotifications > 0) {
			reasons.push(`${recentNotifications} notifications`);
		}

		if (recentOverlays > 0) {
			reasons.push(`${recentOverlays} overlays`);
		}

		if (pendingTasks > 0) {
			reasons.push(`${pendingTasks} queued tasks`);
		}

		if (dueTasks > 0) {
			reasons.push(`${dueTasks} due tasks`);
		}

		if (profile.metric.note) {
			reasons.push(profile.metric.note);
		}

		diagnostics.push({
			extensionId: profile.extensionId,
			source: profile.source,
			score,
			recentHandlerMs,
			recentStatusUpdates,
			recentNotifications,
			recentOverlays,
			pendingTasks,
			dueTasks,
			reasons,
		});
	}

	return diagnostics.sort(
		(left, right) => right.score - left.score || left.extensionId.localeCompare(right.extensionId),
	);
}

export function formatExtensionDiagnostic(diagnostic: ExtensionDiagnostic): string {
	return `${diagnostic.extensionId} · ${diagnostic.reasons.join(" · ")}`;
}

export function getStartupDiagnostics(): StartupDiagnostic[] {
	const diagnostics: StartupDiagnostic[] = [];

	for (const profile of profiles.values()) {
		const startupSamples = profile.eventSamples.filter((sample) => sample.name === "session_start");
		if (startupSamples.length === 0) {
			continue;
		}

		const totalMs = startupSamples.reduce((total, sample) => total + sample.durationMs, 0);
		const latestSample = startupSamples.at(-1) ?? null;
		diagnostics.push({
			extensionId: profile.extensionId,
			source: profile.source,
			totalMs: Math.round(totalMs * 100) / 100,
			lastMs: Math.round((latestSample?.durationMs ?? 0) * 100) / 100,
			count: startupSamples.length,
			latestAt: latestSample?.timestamp ?? null,
		});
	}

	return diagnostics.sort((left, right) => right.lastMs - left.lastMs || right.totalMs - left.totalMs);
}

export function formatStartupDiagnostic(diagnostic: StartupDiagnostic): string {
	return `${diagnostic.extensionId} · last ${diagnostic.lastMs.toFixed(1)}ms · total ${diagnostic.totalMs.toFixed(1)}ms`;
}

function wrapContext<T>(ctx: T, extensionId: string, source: string): T {
	if (!ctx || typeof ctx !== "object") {
		return ctx;
	}

	const candidate = ctx as { ui?: Record<string, (...args: unknown[]) => unknown> };
	if (!candidate.ui || typeof candidate.ui !== "object") {
		return ctx;
	}

	let byExtension = wrappedContextCache.get(ctx as object);
	if (!byExtension) {
		byExtension = new Map<string, unknown>();
		wrappedContextCache.set(ctx as object, byExtension);
	}
	const cached = byExtension.get(extensionId);
	if (cached) {
		return cached as T;
	}

	const ui = candidate.ui;
	const wrapped = {
		...(ctx as Record<string, unknown>),
		ui: {
			...ui,
			setStatus: (...args: unknown[]) => {
				recordRuntimeUiActivity(extensionId, "status", source);
				return ui.setStatus?.(...args);
			},
			notify: (...args: unknown[]) => {
				recordRuntimeUiActivity(extensionId, "notify", source);
				return ui.notify?.(...args);
			},
			custom: (...args: unknown[]) => {
				recordRuntimeUiActivity(extensionId, "overlay", source);
				return ui.custom?.(...args);
			},
			setWidget: (...args: unknown[]) => {
				recordRuntimeUiActivity(extensionId, "widget", source);
				return ui.setWidget?.(...args);
			},
			setFooter: (...args: unknown[]) => {
				recordRuntimeUiActivity(extensionId, "footer", source);
				return ui.setFooter?.(...args);
			},
		},
	} as T;
	byExtension.set(extensionId, wrapped);
	return wrapped;
}

function wrapArgsWithContext(args: unknown[], extensionId: string, source: string): unknown[] {
	const index = args.findIndex((arg) =>
		Boolean(arg && typeof arg === "object" && "ui" in (arg as Record<string, unknown>)),
	);
	if (index === -1) {
		return args;
	}
	const nextArgs = [...args];
	nextArgs[index] = wrapContext(nextArgs[index], extensionId, source);
	return nextArgs;
}

function inferCallerIdentity(): { extensionId: string; source: string } {
	const source = inferExtensionSourceFromStack();
	return {
		extensionId: profileSourceToId(source),
		source,
	};
}

function wrapWithTiming<T extends (...args: unknown[]) => unknown>(
	extensionId: string,
	source: string,
	channel: RuntimeChannel,
	name: string,
	fn: T,
): T {
	return (async (...args: unknown[]) => {
		const startedAt = Date.now();
		try {
			return await fn(...wrapArgsWithContext(args, extensionId, source));
		} finally {
			recordRuntimeSample(extensionId, channel, name, Date.now() - startedAt, source);
		}
	}) as T;
}

export function installRuntimeDiagnostics(pi: ExtensionAPI): void {
	const profileTarget = pi as ExtensionAPI & { [INSTALL_SYMBOL]?: boolean };
	if (profileTarget[INSTALL_SYMBOL]) {
		return;
	}
	profileTarget[INSTALL_SYMBOL] = true;

	const originalOn = pi.on.bind(pi);
	pi.on = ((eventName: string, handler: (...args: unknown[]) => unknown) => {
		const { extensionId, source } = inferCallerIdentity();
		noteRegistration(extensionId, source, "events", eventName);
		return originalOn(eventName, wrapWithTiming(extensionId, source, "event", eventName, handler));
	}) as ExtensionAPI["on"];

	const originalRegisterCommand = pi.registerCommand.bind(pi);
	pi.registerCommand = ((
		name: string,
		spec: { handler?: (...args: unknown[]) => unknown } & Record<string, unknown>,
	) => {
		const { extensionId, source } = inferCallerIdentity();
		noteRegistration(extensionId, source, "commands", name);
		const nextSpec = spec.handler
			? { ...spec, handler: wrapWithTiming(extensionId, source, "command", name, spec.handler) }
			: spec;
		return originalRegisterCommand(name, nextSpec);
	}) as ExtensionAPI["registerCommand"];

	const originalRegisterTool = pi.registerTool.bind(pi);
	pi.registerTool = ((tool: { name: string; execute?: (...args: unknown[]) => unknown } & Record<string, unknown>) => {
		const { extensionId, source } = inferCallerIdentity();
		noteRegistration(extensionId, source, "tools", tool.name);
		const nextTool = tool.execute
			? { ...tool, execute: wrapWithTiming(extensionId, source, "tool", tool.name, tool.execute) }
			: tool;
		return originalRegisterTool(nextTool);
	}) as ExtensionAPI["registerTool"];

	if (typeof pi.registerShortcut === "function") {
		const originalRegisterShortcut = pi.registerShortcut.bind(pi);
		pi.registerShortcut = ((name: string, spec: Record<string, unknown>) => {
			const { extensionId, source } = inferCallerIdentity();
			noteRegistration(extensionId, source, "shortcuts", name);
			return originalRegisterShortcut(name, spec as never);
		}) as ExtensionAPI["registerShortcut"];
	}

	pi.events.on(RUNTIME_DIAGNOSTICS_EVENT, (payload: unknown) => {
		if (!payload || typeof payload !== "object") {
			return;
		}

		const extensionId = (payload as RuntimeDiagnosticsMetric).extensionId;
		if (typeof extensionId !== "string" || extensionId.length === 0) {
			return;
		}

		recordRuntimeMetric(payload as RuntimeDiagnosticsMetric);
	});
}

export function resetRuntimeDiagnosticsForTests(): void {
	profiles.clear();
}
