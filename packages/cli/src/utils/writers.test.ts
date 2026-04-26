import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OhPConfigWithRouting } from "../types.js";
import {
	writeAdaptiveRoutingConfig,
	writeAgents,
	writeExtensions,
	writeModelConfig,
	writeProviderEnv,
} from "./writers.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "oh-pi-writers-"));
	tempDirs.push(dir);
	return dir;
}

function makeConfig(overrides: Partial<OhPConfigWithRouting>): OhPConfigWithRouting {
	return {
		agents: "general-developer",
		extensions: [],
		keybindings: "default",
		prompts: [],
		providers: [],
		theme: "dark",
		thinking: "medium",
		...overrides,
	};
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe(writeExtensions, () => {
	it("copies the dedicated plan package into the local extensions directory with vendored runtime deps", () => {
		const dir = makeTempDir();
		writeExtensions(
			dir,
			makeConfig({
				extensions: ["plan"],
			}),
		);

		expect(existsSync(join(dir, "extensions", "plan", "index.ts"))).toBeTruthy();
		expect(existsSync(join(dir, "extensions", "plan", "prompts", "PLAN.prompt.md"))).toBeTruthy();
		expect(existsSync(join(dir, "extensions", "plan", "node_modules", "@ifi", "pi-shared-qna", "index.ts"))).toBeTruthy();
		expect(
			existsSync(join(dir, "extensions", "plan", "node_modules", "@ifi", "pi-extension-subagents", "execution.ts")),
		).toBeTruthy();
	});

	it("copies the dedicated spec package into the local extensions directory", () => {
		const dir = makeTempDir();
		writeExtensions(
			dir,
			makeConfig({
				extensions: ["spec"],
			}),
		);

		expect(existsSync(join(dir, "extensions", "spec", "index.ts"))).toBeTruthy();
		expect(existsSync(join(dir, "extensions", "spec", "assets", "templates", "spec-template.md"))).toBeTruthy();
	});

	it("copies the dedicated diagnostics package into the local extensions directory", () => {
		const dir = makeTempDir();
		writeExtensions(
			dir,
			makeConfig({
				extensions: ["diagnostics"],
			}),
		);

		expect(existsSync(join(dir, "extensions", "diagnostics", "index.ts"))).toBeTruthy();
		expect(existsSync(join(dir, "extensions", "diagnostics", "diagnostics-shared.ts"))).toBeTruthy();
	});
});

describe(writeAdaptiveRoutingConfig, () => {
	it("writes delegated provider assignments for adaptive routing", () => {
		const dir = makeTempDir();
		writeAdaptiveRoutingConfig(
			dir,
			makeConfig({
				adaptiveRouting: {
					categories: {
						"implementation-default": ["openai", "ollama-cloud"],
						"quick-discovery": ["groq", "openai"],
					},
					mode: "shadow",
				},
			}),
		);

		const configPath = join(dir, "extensions", "adaptive-routing", "config.json");
		expect(existsSync(configPath)).toBeTruthy();
		const text = readFileSync(configPath, "utf8");
		expect(text).toContain('"mode": "shadow"');
		expect(text).toContain('"quick-discovery"');
		expect(text).toContain('"preferredProviders"');
		expect(text).toContain('"groq"');
	});
});

describe(writeAgents, () => {
	it("appends ant-colony auto-trigger guidance for non-colony operator agents", () => {
		const dir = makeTempDir();
		writeAgents(
			dir,
			makeConfig({
				agents: "general-developer",
				extensions: ["ant-colony"],
			}),
		);

		const content = readFileSync(join(dir, "AGENTS.md"), "utf8");
		expect(content).toContain("## Ant Colony Auto-Trigger");
		expect(content).toContain("automatically use it when the task is complex");
		expect(content).toContain("COLONY_SIGNAL");
	});

	it("does not append guidance when ant-colony extension is disabled", () => {
		const dir = makeTempDir();
		writeAgents(
			dir,
			makeConfig({
				agents: "general-developer",
				extensions: [],
			}),
		);

		const content = readFileSync(join(dir, "AGENTS.md"), "utf8");
		expect(content).not.toContain("## Ant Colony Auto-Trigger");
	});

	it("does not append duplicate guidance for colony-operator template", () => {
		const dir = makeTempDir();
		writeAgents(
			dir,
			makeConfig({
				agents: "colony-operator",
				extensions: ["ant-colony"],
			}),
		);

		const content = readFileSync(join(dir, "AGENTS.md"), "utf8");
		expect(content).not.toContain("## Ant Colony Auto-Trigger");
		expect(content).toContain("You command an autonomous ant colony");
	});
});

describe("provider keep strategy", () => {
	it("writeProviderEnv does not touch settings/auth when strategy is keep", () => {
		const dir = makeTempDir();
		const settingsPath = join(dir, "settings.json");
		const authPath = join(dir, "auth.json");
		const originalSettings = JSON.stringify({ defaultModel: "gpt-4o", defaultProvider: "openai" }, null, 2);
		const originalAuth = JSON.stringify({ openai: { key: "OPENAI_API_KEY", type: "api_key" } }, null, 2);
		writeFileSync(settingsPath, originalSettings);
		writeFileSync(authPath, originalAuth);

		writeProviderEnv(
			dir,
			makeConfig({
				providerStrategy: "keep",
				providers: [],
			}),
		);

		expect(readFileSync(settingsPath, "utf8")).toBe(originalSettings);
		expect(readFileSync(authPath, "utf8")).toBe(originalAuth);
	});

	it("writeModelConfig does not touch models.json when strategy is keep", () => {
		const dir = makeTempDir();
		const modelsPath = join(dir, "models.json");
		const originalModels = JSON.stringify(
			{
				providers: {
					openai: { api: "openai-responses", baseUrl: "https://api.openai.com" },
				},
			},
			null,
			2,
		);
		writeFileSync(modelsPath, originalModels);

		writeModelConfig(
			dir,
			makeConfig({
				providerStrategy: "keep",
				providers: [],
			}),
		);

		expect(readFileSync(modelsPath, "utf8")).toBe(originalModels);
	});

	it("writeModelConfig creates custom provider entries when replacing", () => {
		const dir = makeTempDir();
		writeModelConfig(
			dir,
			makeConfig({
				providerStrategy: "replace",
				providers: [
					{
						api: "openai-responses",
						apiKey: "OPENAI_API_KEY",
						baseUrl: "https://api.openai.com",
						defaultModel: "gpt-4o",
						name: "custom-openai",
					},
				],
			}),
		);

		const modelsPath = join(dir, "models.json");
		expect(existsSync(modelsPath)).toBeTruthy();
		const text = readFileSync(modelsPath, "utf8");
		expect(text).toContain('"custom-openai"');
		expect(text).toContain('"openai-responses"');
	});

	it("writeModelConfig persists API mode for builtin OpenAI without custom baseUrl", () => {
		const dir = makeTempDir();
		writeModelConfig(
			dir,
			makeConfig({
				providerStrategy: "replace",
				providers: [
					{
						api: "openai-responses",
						apiKey: "OPENAI_API_KEY",
						defaultModel: "gpt-5",
						name: "openai",
					},
				],
			}),
		);

		const modelsPath = join(dir, "models.json");
		expect(existsSync(modelsPath)).toBeTruthy();
		const models = JSON.parse(readFileSync(modelsPath, "utf8"));
		expect(models.providers.openai.api).toBe("openai-responses");
		expect(models.providers.openai.baseUrl).toBeUndefined();
	});

	it("writeModelConfig keeps API mode when overriding builtin baseUrl without discovered models", () => {
		const dir = makeTempDir();
		writeModelConfig(
			dir,
			makeConfig({
				providerStrategy: "replace",
				providers: [
					{
						api: "openai-responses",
						apiKey: "OPENAI_API_KEY",
						baseUrl: "https://api.openai.com/v1",
						defaultModel: "gpt-4o",
						name: "openai",
					},
				],
			}),
		);

		const modelsPath = join(dir, "models.json");
		expect(existsSync(modelsPath)).toBeTruthy();
		const models = JSON.parse(readFileSync(modelsPath, "utf8"));
		expect(models.providers.openai.baseUrl).toBe("https://api.openai.com/v1");
		expect(models.providers.openai.api).toBe("openai-responses");
	});

	it("writeProviderEnv merges auth/settings when strategy is add", () => {
		const dir = makeTempDir();
		const settingsPath = join(dir, "settings.json");
		const authPath = join(dir, "auth.json");
		writeFileSync(
			settingsPath,
			JSON.stringify(
				{
					defaultModel: "claude-sonnet-4-20250514",
					defaultProvider: "anthropic",
					enabledModels: ["claude-sonnet-4-20250514"],
					theme: "dark",
				},
				null,
				2,
			),
		);
		writeFileSync(
			authPath,
			JSON.stringify(
				{
					anthropic: { key: "ANTHROPIC_API_KEY", type: "api_key" },
				},
				null,
				2,
			),
		);

		writeProviderEnv(
			dir,
			makeConfig({
				providerStrategy: "add",
				providers: [
					{
						name: "openai",
						apiKey: "OPENAI_API_KEY",
						defaultModel: "gpt-4o",
						discoveredModels: [
							{ id: "gpt-4o", reasoning: false, input: ["text", "image"], contextWindow: 128000, maxTokens: 16384 },
						],
					},
				],
				theme: "light",
			}),
		);

		const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
		const auth = JSON.parse(readFileSync(authPath, "utf8"));
		expect(settings.defaultProvider).toBe("anthropic");
		expect(settings.defaultModel).toBe("claude-sonnet-4-20250514");
		expect(settings.theme).toBe("light");
		expect(settings.enabledModels).toContain("claude-sonnet-4-20250514");
		expect(settings.enabledModels).toContain("gpt-4o");
		expect(auth.anthropic).toBe(true);
		expect(auth.openai).toStrictEqual({ key: "OPENAI_API_KEY", type: "api_key" });
	});

	it("writeModelConfig merges custom providers when strategy is add", () => {
		const dir = makeTempDir();
		const modelsPath = join(dir, "models.json");
		writeFileSync(
			modelsPath,
			JSON.stringify(
				{
					providers: {
						existing: { api: "openai-completions", baseUrl: "https://example.com/v1" },
					},
				},
				null,
				2,
			),
		);

		writeModelConfig(
			dir,
			makeConfig({
				providerStrategy: "add",
				providers: [
					{
						api: "openai-responses",
						apiKey: "OPENAI_API_KEY",
						baseUrl: "https://api.openai.com",
						defaultModel: "gpt-4o",
						name: "custom-openai",
					},
				],
			}),
		);

		const models = JSON.parse(readFileSync(modelsPath, "utf8"));
		expect(models.providers.existing).toBe(true);
		expect(models.providers["custom-openai"]).toBe(true);
		expect(JSON.stringify(models.providers["custom-openai"])).toContain("openai-responses");
	});
});
