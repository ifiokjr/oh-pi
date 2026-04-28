import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const promptState = vi.hoisted(() => ({
	confirm: [] as unknown[],
	select: [] as unknown[],
	multiselect: [] as unknown[],
	notes: [] as Array<{ message: string; title?: string }>,
	warns: [] as string[],
	cancels: [] as string[],
	spinnerStarts: [] as string[],
	spinnerStops: [] as string[],
}));

const dashboardMocks = vi.hoisted(() => ({
	buildRoutingDashboard: vi.fn(({ config }: { config?: { mode?: string } }) => `dashboard:${config?.mode ?? "unset"}`),
	detectOptionalRoutingPackages: vi.fn(),
	suggestOptionalRoutingPackages: vi.fn(),
	ROUTING_CATEGORIES: [
		{
			name: "quick-discovery",
			label: "Quick discovery",
			recommended: ["groq", "openai"],
		},
		{
			name: "implementation-default",
			label: "Implementation",
			recommended: ["openai", "groq"],
		},
	],
}));

const packageMocks = vi.hoisted(() => ({
	installPiPackages: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
	confirm: vi.fn(async () => promptState.confirm.shift()),
	select: vi.fn(async () => promptState.select.shift()),
	multiselect: vi.fn(async () => promptState.multiselect.shift()),
	note: vi.fn((message: string, title?: string) => {
		promptState.notes.push({ message, title });
	}),
	cancel: vi.fn((message: string) => {
		promptState.cancels.push(message);
	}),
	isCancel: (value: unknown) => value === "__CANCEL__",
	log: {
		warn: vi.fn((message: string) => {
			promptState.warns.push(message);
		}),
	},
	spinner: () => ({
		start: (message: string) => {
			promptState.spinnerStarts.push(message);
		},
		stop: (message: string) => {
			promptState.spinnerStops.push(message);
		},
	}),
}));

vi.mock("./routing-dashboard.js", () => dashboardMocks);
vi.mock("../utils/pi-packages.js", () => packageMocks);

import { setupAdaptiveRouting, summarizeAdaptiveRouting } from "./routing-setup.js";

function makeProviders() {
	return [
		{ name: "openai", apiKey: "OPENAI_API_KEY", defaultModel: "gpt-4o" },
		{
			name: "groq",
			apiKey: "GROQ_API_KEY",
			defaultModel: "llama-3.3-70b-versatile",
		},
	];
}

function missingPackage(packageName: string, label = packageName) {
	return {
		packageName,
		label,
		hint: `${label} hint`,
		scope: "none",
		installed: false,
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

describe("setupAdaptiveRouting", () => {
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

		const result = await setupAdaptiveRouting(makeProviders(), undefined, {
			piInstalled: true,
		});

		expect(result).toEqual({
			mode: "shadow",
			categories: {
				"quick-discovery": ["groq", "openai"],
				"implementation-default": ["openai", "groq"],
			},
		});
		expect(packageMocks.installPiPackages).toHaveBeenCalledWith(["@ifi/pi-provider-ollama"], "project");
		expect(promptState.spinnerStarts).toEqual(["Installing optional routing packages (project)"]);
		expect(promptState.spinnerStops[0]).toContain("Installed 1 optional package(s) in project scope");
		expect(dashboardMocks.detectOptionalRoutingPackages).toHaveBeenNthCalledWith(2, undefined, [
			{ packageName: "@ifi/pi-provider-ollama", scope: "project" },
		]);
		expect(promptState.notes.map((entry) => entry.message)).toEqual([
			"dashboard:unset",
			"dashboard:unset",
			"dashboard:unset",
			"dashboard:shadow",
		]);
	});

	it("shows a note instead of installing packages when pi is missing", async () => {
		const currentConfig = {
			mode: "off" as const,
			categories: { "quick-discovery": ["openai"] },
		};
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([missingPackage("@ifi/pi-provider-ollama")]);
		promptState.confirm.push(false);

		const result = await setupAdaptiveRouting(makeProviders(), currentConfig, {
			piInstalled: false,
		});

		expect(result).toBe(currentConfig);
		expect(packageMocks.installPiPackages).not.toHaveBeenCalled();
		expect(promptState.notes.some((entry) => entry.title === "Optional Packages")).toBe(true);
	});

	it("skips installation when the user declines and returns the current config when not reconfiguring", async () => {
		const currentConfig = {
			mode: "shadow" as const,
			categories: { "quick-discovery": ["openai"] },
		};
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([missingPackage("@ifi/pi-provider-ollama")]);
		dashboardMocks.suggestOptionalRoutingPackages.mockReturnValue(["@ifi/pi-provider-ollama"]);
		promptState.confirm.push(false, false);

		const result = await setupAdaptiveRouting(makeProviders(), currentConfig, {
			piInstalled: true,
		});

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

		const result = await setupAdaptiveRouting(makeProviders(), undefined, {
			piInstalled: true,
		});

		expect(result).toBeUndefined();
		expect(promptState.warns).toEqual(["Error: network unavailable"]);
		expect(promptState.spinnerStops).toContain("Optional package install failed.");
	});

	it("returns early when no optional packages are selected for installation", async () => {
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([missingPackage("@ifi/pi-provider-ollama")]);
		dashboardMocks.suggestOptionalRoutingPackages.mockReturnValue(["@ifi/pi-provider-ollama"]);
		promptState.confirm.push(true, false);
		promptState.multiselect.push([]);

		const result = await setupAdaptiveRouting(makeProviders(), undefined, {
			piInstalled: true,
		});

		expect(result).toBeUndefined();
		expect(packageMocks.installPiPackages).not.toHaveBeenCalled();
	});

	it("uses the only provider when no recommended provider matches", async () => {
		dashboardMocks.detectOptionalRoutingPackages.mockReturnValue([]);
		promptState.confirm.push(true, false);
		promptState.select.push("off", "custom-provider", "custom-provider");

		const result = await setupAdaptiveRouting([
			{
				name: "custom-provider",
				apiKey: "none",
				defaultModel: "model-a",
			},
		]);

		expect(result).toEqual({
			mode: "off",
			categories: {
				"quick-discovery": ["custom-provider"],
				"implementation-default": ["custom-provider"],
			},
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

		expect(promptState.cancels).toEqual(["Cancelled."]);
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

		expect(promptState.cancels).toEqual(["Cancelled."]);
		expect(exit).toHaveBeenCalledWith(0);
	});
});

describe("summarizeAdaptiveRouting", () => {
	it("summarizes configured and missing routing states", () => {
		expect(summarizeAdaptiveRouting(undefined)).toBe("not configured");
		expect(
			summarizeAdaptiveRouting({
				mode: "auto",
				categories: { a: ["openai"], b: ["groq"] },
			}),
		).toBe("auto · 2 categories");
	});
});
