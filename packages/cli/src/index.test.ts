import { beforeEach, describe, expect, it, vi } from "vitest";

const getLocale = vi.fn(() => "en");
const selectLanguage = vi.fn(async () => undefined);
const confirmApply = vi.fn(async () => undefined);
const selectMode = vi.fn(async () => "quick");
const setupProviders = vi.fn(async () => ({ providers: [{ name: "openai", apiKey: "set" }], providerMode: "custom" }));
const setupAdaptiveRouting = vi.fn(async () => ({ enabled: false }));
const welcome = vi.fn();
const detectEnv = vi.fn(async () => ({ existingProviders: ["anthropic"] }));

vi.mock("@ifi/oh-pi-core", () => ({
	EXTENSIONS: [],
	getLocale,
	selectLanguage,
}));
vi.mock("./tui/config-wizard.js", () => ({ runConfigWizard: vi.fn() }));
vi.mock("./tui/confirm-apply.js", () => ({ confirmApply }));
vi.mock("./tui/mode-select.js", () => ({ selectMode }));
vi.mock("./tui/preset-select.js", () => ({ selectPreset: vi.fn() }));
vi.mock("./tui/provider-setup.js", () => ({ setupProviders }));
vi.mock("./tui/routing-setup.js", () => ({ setupAdaptiveRouting }));
vi.mock("./tui/welcome.js", () => ({ welcome }));
vi.mock("./utils/detect.js", () => ({ detectEnv }));

describe("cli quick flow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("includes diagnostics in the quick preset defaults", async () => {
		const { run } = await import("./index.js");
		await run();

		expect(setupAdaptiveRouting).toHaveBeenCalledWith([
			{ name: "anthropic", apiKey: "none" },
			{ name: "openai", apiKey: "set" },
		]);
		expect(confirmApply).toHaveBeenCalledWith(
			expect.objectContaining({
				locale: "en",
				extensions: expect.arrayContaining(["diagnostics"]),
			}),
			expect.objectContaining({ existingProviders: ["anthropic"] }),
		);
		expect(welcome).toHaveBeenCalled();
		expect(selectLanguage).toHaveBeenCalled();
	});
});
