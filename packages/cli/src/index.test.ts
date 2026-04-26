const getLocale = vi.fn(() => "en");
const selectLanguage = vi.fn(async () => {});
const confirmApply = vi.fn(async () => {});
const selectMode = vi.fn(async () => "quick");
const selectPreset = vi.fn(async () => ({ agents: "preset-agent" }));
const runConfigWizard = vi.fn(async (_env, initial) => ({ ...initial, providerMode: "custom", providers: [] }));
const setupProviders = vi.fn(async () => ({ providerMode: "custom", providers: [{ name: "openai", apiKey: "set" }] }));
const setupAdaptiveRouting = vi.fn(async () => ({ enabled: false }));
const welcome = vi.fn();
const detectEnv = vi.fn(async () => ({ existingProviders: ["anthropic"] }));

vi.mock<typeof import("@ifi/oh-pi-core")>(import("@ifi/oh-pi-core"), () => ({
	EXTENSIONS: [
		{ default: true, name: "git-guard" },
		{ default: true, name: "diagnostics" },
		{ default: false, name: "watchdog" },
	],
	getLocale,
	selectLanguage,
}));
vi.mock<typeof import("./tui/config-wizard.js")>(import("./tui/config-wizard.js"), () => ({ runConfigWizard }));
vi.mock<typeof import("./tui/confirm-apply.js")>(import("./tui/confirm-apply.js"), () => ({ confirmApply }));
vi.mock<typeof import("./tui/mode-select.js")>(import("./tui/mode-select.js"), () => ({ selectMode }));
vi.mock<typeof import("./tui/preset-select.js")>(import("./tui/preset-select.js"), () => ({ selectPreset }));
vi.mock<typeof import("./tui/provider-setup.js")>(import("./tui/provider-setup.js"), () => ({ setupProviders }));
vi.mock<typeof import("./tui/routing-setup.js")>(import("./tui/routing-setup.js"), () => ({ setupAdaptiveRouting }));
vi.mock<typeof import("./tui/welcome.js")>(import("./tui/welcome.js"), () => ({ welcome }));
vi.mock<typeof import("./utils/detect.js")>(import("./utils/detect.js"), () => ({ detectEnv }));

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
			{ apiKey: "none", name: "anthropic" },
			{ apiKey: "set", name: "openai" },
		]);
		expect(confirmApply).toHaveBeenCalledWith(
			expect.objectContaining({
				extensions: expect.arrayContaining(["diagnostics"]),
				locale: "en",
			}),
			expect.objectContaining({ existingProviders: ["anthropic"] }),
		);
		expect(welcome).toHaveBeenCalledWith();
		expect(selectLanguage).toHaveBeenCalledWith();
	});

	it("runs the preset flow through preset selection and the config wizard", async () => {
		selectMode.mockResolvedValue("preset");
		runConfigWizard.mockResolvedValue({ agents: "preset-agent", providerMode: "custom", providers: [] });

		const { run } = await import("./index.js");
		await run();

		expect(selectPreset).toHaveBeenCalledWith();
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
				agents: "general-developer",
				extensions: ["git-guard", "diagnostics"],
				keybindings: "default",
				prompts: expect.arrayContaining(["review", "document", "pr"]),
				theme: "dark",
				thinking: "medium",
			}),
		);
		expect(confirmApply).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }), expect.anything());
		expect(selectPreset).not.toHaveBeenCalled();
	});
});
