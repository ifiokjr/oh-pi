import { beforeEach, describe, expect, it, vi } from "vitest";

const getLocale = vi.fn(() => "en");
const selectLanguage = vi.fn(async () => undefined);
const confirmApply = vi.fn(async () => undefined);
const selectMode = vi.fn(async () => "quick");
const selectPreset = vi.fn(async () => ({ agents: "preset-agent" }));
const runConfigWizard = vi.fn(async (_env, initial) => ({ ...initial, providerMode: "custom", providers: [] }));
const setupProviders = vi.fn(async () => ({ providers: [{ name: "openai", apiKey: "set" }], providerMode: "custom" }));
const setupAdaptiveRouting = vi.fn(async () => ({ enabled: false }));
const welcome = vi.fn();
const detectEnv = vi.fn(async () => ({ existingProviders: ["anthropic"] }));

vi.mock("@ifi/oh-pi-core", () => ({
	EXTENSIONS: [
		{ name: "git-guard", default: true },
		{ name: "diagnostics", default: true },
		{ name: "watchdog", default: false },
	],
	getLocale,
	selectLanguage,
}));
vi.mock("./tui/config-wizard.js", () => ({ runConfigWizard }));
vi.mock("./tui/confirm-apply.js", () => ({ confirmApply }));
vi.mock("./tui/mode-select.js", () => ({ selectMode }));
vi.mock("./tui/preset-select.js", () => ({ selectPreset }));
vi.mock("./tui/provider-setup.js", () => ({ setupProviders }));
vi.mock("./tui/routing-setup.js", () => ({ setupAdaptiveRouting }));
vi.mock("./tui/welcome.js", () => ({ welcome }));
vi.mock("./utils/detect.js", () => ({ detectEnv }));

describe("cli setup flows", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectMode.mockResolvedValue("quick");
		selectPreset.mockResolvedValue({ agents: "preset-agent" });
		runConfigWizard.mockImplementation(async (_env, initial) => ({
			...initial,
			providerMode: "custom",
			providers: [],
		}));
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

	it("runs the preset flow through preset selection and the config wizard", async () => {
		selectMode.mockResolvedValue("preset");
		runConfigWizard.mockResolvedValue({ providerMode: "custom", providers: [], agents: "preset-agent" });

		const { run } = await import("./index.js");
		await run();

		expect(selectPreset).toHaveBeenCalled();
		expect(runConfigWizard).toHaveBeenCalledWith(expect.objectContaining({ existingProviders: ["anthropic"] }), {
			agents: "preset-agent",
		});
		expect(confirmApply).toHaveBeenCalledWith(
			expect.objectContaining({ agents: "preset-agent", locale: "en" }),
			expect.anything(),
		);
		expect(setupProviders).not.toHaveBeenCalled();
	});

	it("runs the custom flow with default extension selections", async () => {
		selectMode.mockResolvedValue("custom");

		const { run } = await import("./index.js");
		await run();

		expect(runConfigWizard).toHaveBeenCalledWith(
			expect.objectContaining({ existingProviders: ["anthropic"] }),
			expect.objectContaining({
				theme: "dark",
				keybindings: "default",
				extensions: ["git-guard", "diagnostics"],
				prompts: expect.arrayContaining(["review", "document", "pr"]),
				agents: "general-developer",
				thinking: "medium",
			}),
		);
		expect(confirmApply).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }), expect.anything());
		expect(selectPreset).not.toHaveBeenCalled();
	});
});
