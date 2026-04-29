import { KEYBINDING_SCHEMES, MODEL_CAPABILITIES, PROVIDERS } from "@ifi/oh-pi-core";
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { AdaptiveRoutingSetupConfig, OhPConfigWithRouting } from "../types.js";

import { ensureDir, syncDir } from "./install.js";
import { resources } from "./resources.js";

function readJson<T>(file: string): T | null {
	try {
		return JSON.parse(readFileSync(file, "utf8")) as T;
	} catch {
		return null;
	}
}

function syncPackageRoot(src: string, dest: string, excludedEntries: string[]) {
	ensureDir(dest);
	const allowedEntries = new Set<string>();
	const excluded = new Set(excludedEntries);
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		if (excluded.has(entry.name)) {
			continue;
		}
		allowedEntries.add(entry.name);
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			syncDir(srcPath, destPath);
		} else {
			copyFileSync(srcPath, destPath);
		}
	}

	for (const entry of readdirSync(dest, { withFileTypes: true })) {
		if (!allowedEntries.has(entry.name)) {
			rmSync(join(dest, entry.name), { force: true, recursive: true });
		}
	}
}

/** Generate auth.json (API keys) and settings.json (model, theme, compaction). */
// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Provider setup must handle many strategy/override combinations
export function writeProviderEnv(agentDir: string, config: OhPConfigWithRouting) {
	if (config.providerStrategy === "keep") {
		return;
	}
	const strategy = config.providerStrategy ?? "replace";
	const authPath = join(agentDir, "auth.json");
	const settingsPath = join(agentDir, "settings.json");

	// Auth.json
	const authProviders = config.providers.filter((p) => !p.baseUrl && p.apiKey !== "none");
	if (authProviders.length > 0) {
		const auth: Record<string, { type: string; key: string }> =
			strategy === "add" ? (readJson<Record<string, { type: string; key: string }>>(authPath) ?? {}) : {};
		for (const p of authProviders) {
			auth[p.name] = { key: p.apiKey, type: "api_key" };
		}
		writeFileSync(authPath, JSON.stringify(auth, null, 2), { mode: 0o600 });
	}

	// Settings.json
	const existingSettings = strategy === "add" ? (readJson<Record<string, unknown>>(settingsPath) ?? {}) : {};
	const primary = config.providers.find((p) => p.baseUrl && p.defaultModel) ?? config.providers[0];
	const providerInfo = primary ? PROVIDERS[primary.name] : undefined;
	const primaryModelId = primary?.defaultModel ?? providerInfo?.models[0];
	const caps = primaryModelId ? MODEL_CAPABILITIES[primaryModelId] : undefined;
	const ctxWindow = caps?.contextWindow ?? primary?.contextWindow ?? 128_000;
	const reserveTokens = Math.max(16_384, Math.round(ctxWindow * 0.15));
	const keepRecentTokens = Math.max(16_384, Math.round(ctxWindow * 0.15));
	const primaryModel = primary?.defaultModel ?? providerInfo?.models[0];

	const defaultProviderModel =
		strategy === "add"
			? !existingSettings.defaultProvider && primary
				? { defaultProvider: primary.name, defaultModel: primaryModel }
				: {}
			: primary
				? { defaultProvider: primary.name, defaultModel: primaryModel }
				: {};

	const settings: Record<string, unknown> = {
		...existingSettings,
		...defaultProviderModel,
		compaction: { enabled: true, keepRecentTokens, reserveTokens },
		defaultThinkingLevel: config.thinking,
		enableSkillCommands: true,
		quietStartup: true,
		retry: { enabled: true, maxRetries: 3 },
		theme: config.theme,
	};

	const nextEnabledModels = config.providers.flatMap((p) => {
		if (p.discoveredModels?.length) {
			return p.discoveredModels.map((m) => m.id);
		}

		const info = PROVIDERS[p.name];
		return info ? info.models : [];
	});

	if (strategy === "add") {
		const current = Array.isArray(existingSettings.enabledModels) ? (existingSettings.enabledModels as string[]) : [];
		const merged = [...new Set([...current, ...nextEnabledModels])];
		if (merged.length > 0) {
			settings.enabledModels = merged;
		}
	} else if (config.providers.length > 1) {
		settings.enabledModels = nextEnabledModels;
	}
	writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

/** Generate models.json for custom endpoints and API mode overrides. */
// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Model config must handle builtin/custom/discovered model combinations
export function writeModelConfig(agentDir: string, config: OhPConfigWithRouting) {
	if (config.providerStrategy === "keep") {
		return;
	}
	const strategy = config.providerStrategy ?? "replace";
	const modelsPath = join(agentDir, "models.json");

	// Persist custom endpoints and API mode overrides (e.g. built-in OpenAI responses/completions choice).
	const modelProviders = config.providers.filter((p) => p.baseUrl || (Boolean(p.api) && Boolean(PROVIDERS[p.name])));
	if (modelProviders.length === 0) {
		return;
	}

	const providers: Record<string, unknown> =
		strategy === "add" ? (readJson<{ providers?: Record<string, unknown> }>(modelsPath)?.providers ?? {}) : {};

	for (const cp of modelProviders) {
		const isBuiltin = Boolean(PROVIDERS[cp.name]);
		if (!cp.baseUrl && isBuiltin && cp.api) {
			providers[cp.name] = { api: cp.api };
			continue;
		}

		if (!cp.baseUrl) {
			continue;
		}

		if (isBuiltin && !cp.discoveredModels?.length) {
			const entry: Record<string, unknown> = { baseUrl: cp.baseUrl };
			if (cp.api) {
				entry.api = cp.api;
			}
			if (cp.apiKey !== "none") {
				entry.apiKey = cp.apiKey;
			}
			providers[cp.name] = entry;
		} else {
			const entry: Record<string, unknown> = {
				api: cp.api ?? "openai-completions",
				baseUrl: cp.baseUrl,
			};
			if (cp.apiKey !== "none") {
				entry.apiKey = cp.apiKey;
			}

			if (cp.discoveredModels?.length) {
				entry.models = cp.discoveredModels.map((m) => ({
					contextWindow: m.contextWindow,
					cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
					id: m.id,
					input: m.input,
					maxTokens: m.maxTokens,
					name: m.id,
					reasoning: m.reasoning,
				}));
			} else if (cp.defaultModel) {
				const caps = MODEL_CAPABILITIES[cp.defaultModel];
				entry.models = [
					{
						contextWindow: cp.contextWindow ?? caps?.contextWindow ?? 128000,
						cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
						id: cp.defaultModel,
						input: cp.multimodal ? ["text", "image"] : (caps?.input ?? ["text"]),
						maxTokens: cp.maxTokens ?? caps?.maxTokens ?? 8192,
						name: cp.defaultModel,
						reasoning: cp.reasoning ?? caps?.reasoning ?? false,
					},
				];
			}
			providers[cp.name] = entry;
		}
	}
	writeFileSync(modelsPath, JSON.stringify({ providers }, null, 2));
}

/** Generate keybindings.json from the selected keybinding scheme. */
export function writeKeybindings(agentDir: string, config: OhPConfigWithRouting) {
	const kb = KEYBINDING_SCHEMES[config.keybindings];
	if (kb && Object.keys(kb).length > 0) {
		writeFileSync(join(agentDir, "keybindings.json"), JSON.stringify(kb, null, 2));
	}
}

/** Generate AGENTS.md from the selected agent template. */
export function writeAgents(agentDir: string, config: OhPConfigWithRouting) {
	const agentsSrc = resources.agent(config.agents);
	try {
		let content = readFileSync(agentsSrc, "utf8");
		if (config.locale && config.locale !== "en") {
			const langNames: Record<string, string> = { fr: "French (Français)" };
			const lang = langNames[config.locale] ?? config.locale;
			content = `## Language\nAlways respond in ${lang}. Use the user's language for all conversations and explanations. Code, commands, and technical terms can remain in English.\n\n${content}`;
		}


		writeFileSync(join(agentDir, "AGENTS.md"), content);
	} catch {
		/* Template not found, skip */
	}
}

function copyDedicatedExtension(extDir: string, extensionName: string, sourceDir: string) {
	if (existsSync(sourceDir)) {
		syncDir(sourceDir, join(extDir, extensionName));
	}
}

function copyPlanExtension(extDir: string) {
	const planDest = join(extDir, "plan");
	const planSrc = resources.planDir();
	if (!existsSync(planSrc)) {
		return;
	}

	syncPackageRoot(planSrc, planDest, ["README.md", "install.mjs", "node_modules", "tests"]);
	const vendoredPackageDir = join(planDest, "node_modules", "@ifi");
	const sharedQnaSrc = resources.sharedQnaDir();
	if (existsSync(sharedQnaSrc)) {
		syncPackageRoot(sharedQnaSrc, join(vendoredPackageDir, "pi-shared-qna"), ["README.md", "tests"]);
	}
	const subagentsSrc = resources.subagentsDir();
	if (existsSync(subagentsSrc)) {
		syncPackageRoot(subagentsSrc, join(vendoredPackageDir, "pi-extension-subagents"), [
			"README.md",
			"banner.png",
			"install.mjs",
			"node_modules",
			"tests",
		]);
	}
}

/** Copy selected extensions to the agent directory. */
export function writeExtensions(agentDir: string, config: OhPConfigWithRouting) {
	const extDir = join(agentDir, "extensions");
	ensureDir(extDir);
	const allowed = new Set(config.extensions);
	// Remove stale extension directories that are no longer in the config
	for (const entry of readdirSync(extDir, { withFileTypes: true })) {
		if (entry.isDirectory() && !allowed.has(entry.name)) {
			rmSync(join(extDir, entry.name), { force: true, recursive: true });
		}
	}
	for (const ext of config.extensions) {

		if (ext === "plan") {
			copyPlanExtension(extDir);
			continue;
		}

		if (ext === "diagnostics") {
			copyDedicatedExtension(extDir, "diagnostics", resources.diagnosticsDir());
			continue;
		}

		if (ext === "spec") {
			copyDedicatedExtension(extDir, "spec", resources.specDir());
			continue;
		}

		const dirSrc = resources.extension(ext);
		const fileSrc = resources.extensionFile(ext);
		if (existsSync(dirSrc) && statSync(dirSrc).isDirectory()) {
			syncDir(dirSrc, join(extDir, ext));
		} else {
			try {
				copyFileSync(fileSrc, join(extDir, `${ext}.ts`));
			} catch {
				/* Skip */
			}
		}
	}
}

function buildAdaptiveRoutingConfig(config: AdaptiveRoutingSetupConfig) {
	const categories = Object.fromEntries(
		Object.entries(config.categories).map(([category, providers]) => [
			category,
			{
				preferredProviders: providers,
			},
		]),
	);
	return {
		delegatedRouting: {
			categories,
			enabled: true,
		},
		mode: config.mode,
	};
}

export function writeAdaptiveRoutingConfig(agentDir: string, config: OhPConfigWithRouting) {
	if (!config.adaptiveRouting) {
		return;
	}
	const adaptiveRoutingDir = join(agentDir, "extensions", "adaptive-routing");
	ensureDir(adaptiveRoutingDir);
	writeFileSync(
		join(adaptiveRoutingDir, "config.json"),
		`${JSON.stringify(buildAdaptiveRoutingConfig(config.adaptiveRouting), null, 2)}\n`,
	);
}

/** Copy selected prompt templates to the agent directory. */
export function writePrompts(agentDir: string, config: OhPConfigWithRouting) {
	const promptDir = join(agentDir, "prompts");
	ensureDir(promptDir);

	for (const promptName of config.prompts) {
		const src = resources.prompt(promptName);
		try {
			copyFileSync(src, join(promptDir, `${promptName}.md`));
		} catch {
			/* Skip */
		}
	}
}

/** Sync all skills to the agent directory. */
export function writeSkills(agentDir: string, _config: OhPConfigWithRouting) {
	const skillDir = join(agentDir, "skills");
	const skillsSrcDir = resources.skillsDir();
	try {
		if (existsSync(skillsSrcDir)) {
			syncDir(skillsSrcDir, skillDir);
		}
	} catch {
		/* Skills dir not found, skip */
	}
}

/** Copy the selected theme to the agent directory. */
export function writeTheme(agentDir: string, config: OhPConfigWithRouting) {
	const themeDir = join(agentDir, "themes");
	ensureDir(themeDir);
	const themeSrc = resources.theme(config.theme);
	try {
		copyFileSync(themeSrc, join(themeDir, `${config.theme}.json`));
	} catch {
		/* Built-in theme */
	}
}
