import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OhPConfig } from "@ifi/oh-pi-core";
import { afterEach, describe, expect, it } from "vitest";
import { writeAgents, writeExtensions, writeModelConfig, writeProviderEnv } from "./writers.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "oh-pi-writers-"));
	tempDirs.push(dir);
	return dir;
}

function makeConfig(overrides: Partial<OhPConfig>): OhPConfig {
	return {
		providers: [],
		theme: "dark",
		keybindings: "default",
		extensions: [],
		prompts: [],
		agents: "general-developer",
		thinking: "medium",
		...overrides,
	};
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("writeExtensions", () => {
	it("copies the dedicated plan package into the local extensions directory with vendored runtime deps", () => {
		const dir = makeTempDir();
		writeExtensions(
			dir,
			makeConfig({
				extensions: ["plan"],
			}),
		);

		expect(existsSync(join(dir, "extensions", "plan", "index.ts"))).toBe(true);
		expect(existsSync(join(dir, "extensions", "plan", "prompts", "PLAN.prompt.md"))).toBe(true);
		expect(existsSync(join(dir, "extensions", "plan", "node_modules", "@ifi", "pi-shared-qna", "index.ts"))).toBe(true);
		expect(
			existsSync(join(dir, "extensions", "plan", "node_modules", "@ifi", "pi-extension-subagents", "execution.ts")),
		).toBe(true);
	});

	it("copies the dedicated spec package into the local extensions directory", () => {
		const dir = makeTempDir();
		writeExtensions(
			dir,
			makeConfig({
				extensions: ["spec"],
			}),
		);

		expect(existsSync(join(dir, "extensions", "spec", "index.ts"))).toBe(true);
		expect(existsSync(join(dir, "extensions", "spec", "assets", "templates", "spec-template.md"))).toBe(true);
	});
});

describe("writeAgents", () => {
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
		const originalSettings = JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-4o" }, null, 2);
		const originalAuth = JSON.stringify({ openai: { type: "api_key", key: "OPENAI_API_KEY" } }, null, 2);
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
					openai: { baseUrl: "https://api.openai.com", api: "openai-responses" },
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
						name: "custom-openai",
						apiKey: "OPENAI_API_KEY",
						baseUrl: "https://api.openai.com",
						defaultModel: "gpt-4o",
						api: "openai-responses",
					},
				],
			}),
		);

		const modelsPath = join(dir, "models.json");
		expect(existsSync(modelsPath)).toBe(true);
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
						name: "openai",
						apiKey: "OPENAI_API_KEY",
						defaultModel: "gpt-5",
						api: "openai-responses",
					},
				],
			}),
		);

		const modelsPath = join(dir, "models.json");
		expect(existsSync(modelsPath)).toBe(true);
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
						name: "openai",
						apiKey: "OPENAI_API_KEY",
						baseUrl: "https://api.openai.com/v1",
						defaultModel: "gpt-4o",
						api: "openai-responses",
					},
				],
			}),
		);

		const modelsPath = join(dir, "models.json");
		expect(existsSync(modelsPath)).toBe(true);
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
					defaultProvider: "anthropic",
					defaultModel: "claude-sonnet-4-20250514",
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
					anthropic: { type: "api_key", key: "ANTHROPIC_API_KEY" },
				},
				null,
				2,
			),
		);

		writeProviderEnv(
			dir,
			makeConfig({
				providerStrategy: "add",
				theme: "light",
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
			}),
		);

		const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
		const auth = JSON.parse(readFileSync(authPath, "utf8"));
		expect(settings.defaultProvider).toBe("anthropic");
		expect(settings.defaultModel).toBe("claude-sonnet-4-20250514");
		expect(settings.theme).toBe("light");
		expect(settings.enabledModels).toContain("claude-sonnet-4-20250514");
		expect(settings.enabledModels).toContain("gpt-4o");
		expect(auth.anthropic).toBeTruthy();
		expect(auth.openai).toEqual({ type: "api_key", key: "OPENAI_API_KEY" });
	});

	it("writeModelConfig merges custom providers when strategy is add", () => {
		const dir = makeTempDir();
		const modelsPath = join(dir, "models.json");
		writeFileSync(
			modelsPath,
			JSON.stringify(
				{
					providers: {
						existing: { baseUrl: "https://example.com/v1", api: "openai-completions" },
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
						name: "custom-openai",
						apiKey: "OPENAI_API_KEY",
						baseUrl: "https://api.openai.com",
						defaultModel: "gpt-4o",
						api: "openai-responses",
					},
				],
			}),
		);

		const models = JSON.parse(readFileSync(modelsPath, "utf8"));
		expect(models.providers.existing).toBeTruthy();
		expect(models.providers["custom-openai"]).toBeTruthy();
		expect(JSON.stringify(models.providers["custom-openai"])).toContain("openai-responses");
	});
});
