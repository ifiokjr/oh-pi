import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";

vi.mock("@ifi/pi-shared-qna", async () => {
	return await import("../../shared-qna/index.js");
});

import { clearModelsDevCatalogCache } from "../catalog.js";
import { getSupportedProvider } from "../config.js";
import providerCatalogExtension, { resetProviderCatalogRuntimeStateForTests, SUPPORTED_PROVIDERS } from "../index.js";

const envSnapshot = { ...process.env };

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

beforeEach(() => {
	clearModelsDevCatalogCache();
	resetProviderCatalogRuntimeStateForTests();
	for (const provider of SUPPORTED_PROVIDERS) {
		for (const envName of provider.env) {
			delete process.env[envName];
		}
	}
	vi.restoreAllMocks();
});

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		if (!(key in envSnapshot)) {
			delete process.env[key];
		}
	}
	Object.assign(process.env, envSnapshot);
	vi.restoreAllMocks();
});

describe("provider catalog extension", () => {
	it("does not eagerly register the full provider catalog on startup", () => {
		const harness = createExtensionHarness();
		providerCatalogExtension(harness.pi as never);

		expect(harness.commands.has("providers")).toBe(true);
		expect(harness.providers.size).toBe(0);
	});

	it("registers env-configured providers during bootstrap", async () => {
		const provider = getSupportedProvider("moonshotai");
		process.env[provider.env[0] ?? "MOONSHOTAI_API_KEY"] = "moonshot-env-key";
		vi.stubGlobal(
			"fetch",
			vi
				.fn<() => Promise<Response>>()
				.mockImplementationOnce(async () => jsonResponse({ moonshotai: { models: {} } }))
				.mockImplementationOnce(async () => jsonResponse({ data: [] })),
		);

		const harness = createExtensionHarness();
		providerCatalogExtension(harness.pi as never);
		await Promise.resolve();

		expect(harness.providers.has(provider.id)).toBe(true);
	});

	it("registers stored providers on session_start so existing logins still load", async () => {
		const provider = getSupportedProvider("moonshotai");
		const harness = createExtensionHarness();
		const refresh = vi.fn();
		harness.ctx.modelRegistry = {
			authStorage: {
				get: vi.fn((providerId: string) =>
					providerId === provider.id
						? {
								type: "oauth",
								refresh: "moonshot-key",
								access: "moonshot-key",
								expires: Date.now() + 60_000,
								providerId: provider.id,
								models: [],
								lastModelRefresh: Date.now(),
							}
						: undefined,
				),
				set: vi.fn(),
			},
			refresh,
			registerProvider: vi.fn((name, config) => harness.pi.registerProvider(name, config)),
		} as never;

		providerCatalogExtension(harness.pi as never);
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect(harness.providers.has(provider.id)).toBe(true);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("shows a scrollable provider login picker and lazily registers the chosen provider", async () => {
		const provider = SUPPORTED_PROVIDERS[10];
		if (!provider) {
			throw new Error("Expected at least 11 providers in the catalog.");
		}
		const sampleCatalog = {
			[provider.id]: {
				models: {
					"demo-model": {
						id: "demo-model",
						name: "Demo Model",
						reasoning: true,
						attachment: true,
						limit: { context: 262144, output: 32768 },
						modalities: { input: ["text", "image"], output: ["text"] },
					},
				},
			},
		};
		vi.stubGlobal(
			"fetch",
			vi
				.fn<() => Promise<Response>>()
				.mockImplementationOnce(async () => jsonResponse(sampleCatalog))
				.mockImplementationOnce(async () => jsonResponse({ data: [{ id: "demo-model", max_output: 24576 }] })),
		);

		const harness = createExtensionHarness();
		const stored = new Map<string, unknown>();
		const refresh = vi.fn();
		harness.ctx.modelRegistry = {
			authStorage: {
				get: vi.fn((providerId: string) => stored.get(providerId) as never),
				set: vi.fn((providerId: string, credential: unknown) => {
					stored.set(providerId, credential);
				}),
			},
			refresh,
			registerProvider: vi.fn((name, config) => harness.pi.registerProvider(name, config)),
		} as never;

		let pickerFactory: any;
		harness.ctx.ui.select = vi.fn(async () => null) as never;
		harness.ctx.ui.custom = vi.fn((factory: any) => {
			pickerFactory = factory;
			return Promise.resolve(provider);
		}) as never;
		harness.ctx.ui.input = vi.fn(async () => "provider-api-key") as never;

		providerCatalogExtension(harness.pi as never);
		expect(harness.commands.has("providers:login")).toBe(true);
		const command = harness.commands.get("providers:login");
		await command.handler("", harness.ctx);

		expect(harness.ctx.ui.select).not.toHaveBeenCalled();
		expect(harness.ctx.ui.custom).toHaveBeenCalledWith(expect.any(Function), {
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "80%",
				maxHeight: "75%",
			},
		});

		const component = pickerFactory(
			{ requestRender: vi.fn() },
			{
				fg: (_color: string, text: string) => text,
				bold: (text: string) => text,
			},
			{},
			() => undefined,
		);
		const rendered = component.render(120).join("\n");
		expect(rendered).toContain("Select provider to log in");
		expect(rendered).toContain("type / to search");
		expect(rendered).not.toContain("Next 10");
		expect(rendered).not.toContain("Previous 10");

		expect(harness.providers.has(provider.id)).toBe(true);
		expect(stored.get(provider.id)).toMatchObject({
			type: "oauth",
			providerId: provider.id,
		});
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("routes list, info, models, and refresh-models subcommands", async () => {
		const provider = getSupportedProvider("moonshotai");
		const harness = createExtensionHarness();
		harness.ctx.modelRegistry = {
			authStorage: {
				get: vi.fn((providerId: string) =>
					providerId === provider.id
						? {
								type: "oauth",
								providerId: provider.id,
								refresh: "moonshot-key",
								access: "moonshot-key",
								expires: Date.now() + 60_000,
								lastModelRefresh: Date.now(),
								models: [
									{
										id: "moonshot-v1",
										name: "Moonshot V1",
										contextWindow: 131072,
										outputTokens: 16384,
										input: ["text", "image"],
										output: ["text"],
										reasoning: true,
										cost: { input: 0, output: 0 },
									},
								],
							}
						: undefined,
				),
				set: vi.fn(),
			},
			refresh: vi.fn(),
		} as never;

		providerCatalogExtension(harness.pi as never);
		const command = harness.commands.get("providers");

		await command.handler("list moon", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain(`${provider.id} — ${provider.name}`);

		await command.handler(`info ${provider.id}`, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Configured via: login");
		expect(harness.notifications.at(-1)?.msg).toContain("Models available: 1");

		await command.handler(`models ${provider.id}`, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain(`${provider.id} models:`);
		expect(harness.notifications.at(-1)?.msg).toContain("Moonshot V1 [reasoning · vision]");

		await command.handler("refresh-models missing-provider", harness.ctx);
		expect(harness.notifications.at(-1)).toEqual({
			msg: 'No provider matched "missing-provider". Run /providers:list first.',
			type: "warning",
		});
	});

	it("shows colon-style usage and status hints for alias commands", async () => {
		const harness = createExtensionHarness();
		harness.ctx.modelRegistry = {
			authStorage: {
				get: vi.fn(() => undefined),
				set: vi.fn(),
			},
			refresh: vi.fn(),
		} as never;
		providerCatalogExtension(harness.pi as never);

		await harness.commands.get("providers:info")?.handler?.("", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("Usage: /providers:info <provider>");

		await harness.commands.get("providers:info")?.handler?.("does-not-exist", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain('No provider matched "does-not-exist".');

		await harness.commands.get("providers:models")?.handler?.("", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("Usage: /providers:models <provider>");

		vi.stubGlobal(
			"fetch",
			vi.fn(() => {
				throw new Error("catalog unavailable");
			}) as never,
		);
		await harness.commands.get("providers:models")?.handler?.("openai", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("/providers:refresh-models openai");

		await harness.commands.get("providers:models")?.handler?.("does-not-exist", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain('No provider matched "does-not-exist".');

		await harness.commands.get("providers:login")?.handler?.("does-not-exist", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("Run /providers:list first.");

		await harness.commands.get("providers:refresh-models")?.handler?.("does-not-exist", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("Run /providers:list first.");

		await harness.commands.get("providers:status")?.handler?.("", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("/providers:login");
		expect(harness.notifications.at(-1)?.msg).toContain("/providers:refresh-models");

		for (const provider of SUPPORTED_PROVIDERS) {
			process.env[provider.env[0] ?? `${provider.id.toUpperCase()}_API_KEY`] = "configured";
		}
		await harness.commands.get("providers:status")?.handler?.("", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("…and");
	});
});
