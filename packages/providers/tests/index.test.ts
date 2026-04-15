import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import { clearModelsDevCatalogCache } from "../catalog.js";
import { getSupportedProvider } from "../config.js";
import providerCatalogExtension, { resetProviderCatalogRuntimeStateForTests, SUPPORTED_PROVIDERS } from "../index.js";

const envSnapshot = { ...process.env };
const PROVIDER_PICKER_PREVIOUS = "← Previous 10";
const PROVIDER_PICKER_NEXT = "Next 10 →";
const PROVIDER_PICKER_SEARCH = "Search providers…";

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
		} as never;

		providerCatalogExtension(harness.pi as never);
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect(harness.providers.has(provider.id)).toBe(true);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("pages provider login selections in groups of 10 and lazily registers the chosen provider", async () => {
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
		} as never;

		const pickerCalls: string[][] = [];
		harness.ctx.ui.select = vi.fn((_title: string, options: string[]) => {
			pickerCalls.push(options);
			if (pickerCalls.length === 1) {
				return Promise.resolve(PROVIDER_PICKER_NEXT);
			}
			return Promise.resolve(`${provider.name} — ${provider.id} · login`);
		}) as never;
		harness.ctx.ui.input = vi.fn(async () => "provider-api-key") as never;

		providerCatalogExtension(harness.pi as never);
		const command = harness.commands.get("providers");
		await command.handler("login", harness.ctx);

		const providerOptions = (pickerCalls[0] ?? []).filter((option) => {
			return (
				option !== PROVIDER_PICKER_PREVIOUS && option !== PROVIDER_PICKER_NEXT && option !== PROVIDER_PICKER_SEARCH
			);
		});
		expect(providerOptions).toHaveLength(10);
		expect(harness.providers.has(provider.id)).toBe(true);
		expect(stored.get(provider.id)).toMatchObject({ type: "oauth", providerId: provider.id });
		expect(refresh).toHaveBeenCalledTimes(1);
	});
});
