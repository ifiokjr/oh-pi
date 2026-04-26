const promptState = vi.hoisted(() => ({
	cancels: [] as string[],
	confirm: [] as unknown[],
	multiselect: [] as unknown[],
	notes: [] as Array<{ message: string; title?: string }>,
	select: [] as unknown[],
	spinnerStarts: [] as string[],
	spinnerStops: [] as string[],
	warns: [] as string[],
}));

const dashboardMocks = vi.hoisted(() => ({
	ROUTING_CATEGORIES: [
		{ name: "quick-discovery", label: "Quick discovery", recommended: ["groq", "openai"] },
		{ name: "implementation-default", label: "Implementation", recommended: ["openai", "groq"] },
	],
	buildRoutingDashboard: vi.fn(({ config }: { config?: { mode?: string } }) => `dashboard:${config?.mode ?? "unset"}`),
	detectOptionalRoutingPackages: vi.fn(),
	suggestOptionalRoutingPackages: vi.fn(),
}));

const packageMocks = vi.hoisted(() => ({
	installPiPackages: vi.fn(),
}));

vi.mock<typeof import("@clack/prompts")>(import("@clack/prompts"), () => ({
	cancel: vi.fn((message: string) => {
		promptState.cancels.push(message);
	}),
	confirm: vi.fn(async () => promptState.confirm.shift()),
	isCancel: (value: unknown) => value === "__CANCEL__",
	log: {
		warn: vi.fn((message: string) => {
			promptState.warns.push(message);
		}),
	},
	multiselect: vi.fn(async () => promptState.multiselect.shift()),
	note: vi.fn((message: string, title?: string) => {
		promptState.notes.push({ message, title });
	}),
	select: vi.fn(async () => promptState.select.shift()),
	spinner: () => ({
		start: (message: string) => {
			promptState.spinnerStarts.push(message);
		},
		stop: (message: string) => {
			promptState.spinnerStops.push(message);
		},
	}),
}));

vi.mock<typeof import("./routing-dashboard.js")>(import("./routing-dashboard.js"), () => dashboardMocks);
vi.mock<typeof import("../utils/pi-packages.js")>(import("../utils/pi-packages.js"), () => packageMocks);

import { setupAdaptiveRouting, summarizeAdaptiveRouting } from "./routing-setup.js";

function makeProviders() {
	return [
		{ apiKey: "OPENAI_API_KEY", defaultModel: "gpt-4o", name: "openai" },
		{ apiKey: "GROQ_API_KEY", defaultModel: "llama-3.3-70b-versatile", name: "groq" },
	];
}

function missingPackage(packageName: string, label = packageName) {
	return {
		hint: `${label} hint`,
		installed: false,
		label,
		packageName,
		scope: "none",
		selected: false,
	} as const;
}

beforeEach(() => {
	promptState.confirm = [];
	promptState.select = [];
	promptState.multiselect = [];
	promptState.notes = [];
	promptState.warns = [];
	promptState.cancels = [];
	promptState.spinnerStarts = [];
	promptState.spinnerStops = [];
	dashboardMocks.buildRoutingDashboard.mockClear();
	dashboardMocks.detectOptionalRoutingPackages.mockReset();
	dashboardMocks.suggestOptionalRoutingPackages.mockReset();
	packageMocks.installPiPackages.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe(setupAdaptiveRouting, () => {
	it("returns undefined when no providers are available", async () => {
		await expect(setupAdaptiveRouting([])).resolves.toBeUndefined();
		expect(dashboardMocks.buildRoutingDashboard).not.toHaveBeenCalled();
	});

	it("installs missing packages with an explicit scope, configures routing, and re-renders the dashboard", async () => {
		dashboardMocks.detectOptionalRoutingPackages
			.mockReturnValueOnce([missingPackage("@ifi/pi-provider-ollama", "Ollama provider package")])
			.mockReturnValueOnce([])
			.mockReturnValueOnce([]);
		dashboardMocks.suggestOptionalRoutingPackages
			.mockReturnValueOnce(["@ifi/pi-provider-ollama"])
			.mockReturnValueOnce([]);
		promptState.confirm.push(true, true);
		promptState.multiselect.push(["@ifi/pi-provider-ollama"]);
		promptState.select.push("project", "shadow", "groq", "openai");

		const result = await setupAdaptiveRouting(makeProviders(), undefined, { piInstalled: true });

		expect(result).toStrictEqual({
			categories: {
				"implementation-default": ["openai", "groq"],
				"quick-discovery": ["groq", "openai"],
			},
			mode: "shadow",
		});
		expect(packageMocks.installPiPackages).toHaveBeenCalledWith(["@ifi/pi-provider-ollama"], "project");
		expect(promptState.spinnerStarts).toStrictEqual(["Installing optional routing packages (project)"]);
		expect(promptState.spinnerStops[0]).toContain("Installed 1 optional package(s) in project scope");
		expect(dashboardMocks.detectOptionalRoutingPackages).toHaveBeenNthCalledWith(2, undefined, [
			{ packageName: "@ifi/pi-provider-ollama", scope: "project" },
		]);
		expect(promptState.notes.map((entry) => entry.message)).toStrictEqual([
			"dashboard:unset",
			"dashboard:unset",
			"dashboard:unset",
			"dashboard:shadow",
		]);
	});

	it("shows a note instead of installing packages when pi is missing", async () => {
		const currentConfig = { categories: { "quick-discovery": ["openai"] }, mode: "off" as const };
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([missingPackage("@ifi/pi-provider-ollama")]);
		promptState.confirm.push(false);

		const result = await setupAdaptiveRouting(makeProviders(), currentConfig, { piInstalled: false });

		expect(result).toBe(currentConfig);
		expect(packageMocks.installPiPackages).not.toHaveBeenCalled();
		expect(promptState.notes.some((entry) => entry.title === "Optional Packages")).toBeTruthy();
	});

	it("skips installation when the user declines and returns the current config when not reconfiguring", async () => {
		const currentConfig = { categories: { "quick-discovery": ["openai"] }, mode: "shadow" as const };
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([missingPackage("@ifi/pi-provider-ollama")]);
		dashboardMocks.suggestOptionalRoutingPackages.mockReturnValue(["@ifi/pi-provider-ollama"]);
		promptState.confirm.push(false, false);

		const result = await setupAdaptiveRouting(makeProviders(), currentConfig, { piInstalled: true });

		expect(result).toBe(currentConfig);
		expect(packageMocks.installPiPackages).not.toHaveBeenCalled();
	});

	it("continues after install failures and warns the user", async () => {
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([missingPackage("@ifi/pi-provider-ollama")]);
		dashboardMocks.suggestOptionalRoutingPackages.mockReturnValue(["@ifi/pi-provider-ollama"]);
		packageMocks.installPiPackages.mockImplementation(() => {
			throw new Error("network unavailable");
		});
		promptState.confirm.push(true, false, false);
		promptState.multiselect.push(["@ifi/pi-provider-ollama"]);
		promptState.select.push("user");

		const result = await setupAdaptiveRouting(makeProviders(), undefined, { piInstalled: true });

		expect(result).toBeUndefined();
		expect(promptState.warns).toStrictEqual(["Error: network unavailable"]);
		expect(promptState.spinnerStops).toContain("Optional package install failed.");
	});

	it("returns early when no optional packages are selected for installation", async () => {
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([missingPackage("@ifi/pi-provider-ollama")]);
		dashboardMocks.suggestOptionalRoutingPackages.mockReturnValue(["@ifi/pi-provider-ollama"]);
		promptState.confirm.push(true, false);
		promptState.multiselect.push([]);

		const result = await setupAdaptiveRouting(makeProviders(), undefined, { piInstalled: true });

		expect(result).toBeUndefined();
		expect(packageMocks.installPiPackages).not.toHaveBeenCalled();
	});

	it("uses the only provider when no recommended provider matches", async () => {
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([]);
		promptState.confirm.push(true, false);
		promptState.select.push("off", "custom-provider", "custom-provider");

		const result = await setupAdaptiveRouting([{ apiKey: "none", defaultModel: "model-a", name: "custom-provider" }]);

		expect(result).toStrictEqual({
			categories: {
				"implementation-default": ["custom-provider"],
				"quick-discovery": ["custom-provider"],
			},
			mode: "off",
		});
	});

	it("cancels through the shared cancel handler", async () => {
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([missingPackage("@ifi/pi-provider-ollama")]);
		dashboardMocks.suggestOptionalRoutingPackages.mockReturnValue(["@ifi/pi-provider-ollama"]);
		promptState.confirm.push("__CANCEL__");
		const exit = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);

		await expect(setupAdaptiveRouting(makeProviders(), undefined, { piInstalled: true })).rejects.toThrow(
			"process.exit",
		);

		expect(promptState.cancels).toStrictEqual(["Cancelled."]);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("cancels when choosing the install scope", async () => {
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([missingPackage("@ifi/pi-provider-ollama")]);
		dashboardMocks.suggestOptionalRoutingPackages.mockReturnValue(["@ifi/pi-provider-ollama"]);
		promptState.confirm.push(true);
		promptState.multiselect.push(["@ifi/pi-provider-ollama"]);
		promptState.select.push("__CANCEL__");
		const exit = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);

		await expect(setupAdaptiveRouting(makeProviders(), undefined, { piInstalled: true })).rejects.toThrow(
			"process.exit",
		);

		expect(promptState.cancels).toStrictEqual(["Cancelled."]);
		expect(exit).toHaveBeenCalledWith(0);
	});
});

describe(summarizeAdaptiveRouting, () => {
	it("summarizes configured and missing routing states", () => {
		expect(summarizeAdaptiveRouting()).toBe("not configured");
		expect(summarizeAdaptiveRouting({ categories: { a: ["openai"], b: ["groq"] }, mode: "auto" })).toBe(
			"auto · 2 categories",
		);
	});
});
