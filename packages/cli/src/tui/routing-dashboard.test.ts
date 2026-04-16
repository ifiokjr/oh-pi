import type { ProviderConfig } from "@ifi/oh-pi-core";
import { describe, expect, it } from "vitest";
import {
	buildRoutingDashboard,
	detectOptionalRoutingPackages,
	suggestOptionalRoutingPackages,
} from "./routing-dashboard.js";

function makeProviders(): ProviderConfig[] {
	return [
		{
			name: " ",
			apiKey: "IGNORED",
		},
		{
			name: "openai",
			apiKey: "OPENAI_API_KEY",
			defaultModel: "gpt-4o",
			discoveredModels: [
				{ id: "gpt-4o", reasoning: false, input: ["text", "image"], contextWindow: 128000, maxTokens: 16384 },
				{ id: "gpt-5-mini", reasoning: true, input: ["text", "image"], contextWindow: 128000, maxTokens: 16384 },
			],
		},
		{
			name: "openai",
			apiKey: "OPENAI_API_KEY",
			defaultModel: "gpt-5-mini",
		},
		{
			name: "groq",
			apiKey: "GROQ_API_KEY",
			discoveredModels: [
				{
					id: "llama-3.3-70b-versatile",
					reasoning: false,
					input: ["text"],
					contextWindow: 128000,
					maxTokens: 32768,
				},
			],
		},
		{
			name: "cursor-agent",
			apiKey: "none",
		},
	];
}

describe("detectOptionalRoutingPackages", () => {
	it("maps installed scopes and selected package state", () => {
		const packages = detectOptionalRoutingPackages(
			(packageNames) =>
				packageNames.map((packageName) => ({
					packageName,
					scope:
						packageName === "@ifi/pi-provider-ollama"
							? "user"
							: packageName === "@ifi/pi-provider-cursor"
								? "project"
								: "none",
				})),
			["@ifi/pi-extension-adaptive-routing"],
		);

		expect(packages.find((pkg) => pkg.packageName === "@ifi/pi-provider-ollama")).toMatchObject({
			installed: true,
			scope: "user",
			selected: false,
		});
		expect(packages.find((pkg) => pkg.packageName === "@ifi/pi-provider-cursor")).toMatchObject({
			installed: true,
			scope: "project",
		});
		expect(packages.find((pkg) => pkg.packageName === "@ifi/pi-extension-adaptive-routing")).toMatchObject({
			installed: false,
			selected: true,
		});
	});
});

describe("suggestOptionalRoutingPackages", () => {
	it("suggests routing and provider packages based on config and providers", () => {
		expect(
			suggestOptionalRoutingPackages(["ollama-cloud", "cursor-agent", "cursor-agent"], {
				mode: "shadow",
				categories: {},
			}),
		).toEqual(["@ifi/pi-extension-adaptive-routing", "@ifi/pi-provider-ollama", "@ifi/pi-provider-cursor"]);
	});

	it("returns an empty list when nothing is recommended", () => {
		expect(suggestOptionalRoutingPackages(["openai"], { mode: "off", categories: {} })).toEqual([]);
		expect(suggestOptionalRoutingPackages(["openai"])).toEqual([]);
	});
});

describe("buildRoutingDashboard", () => {
	it("surfaces packages, providers, delegated assignments, and effective routing", () => {
		const dashboard = buildRoutingDashboard({
			providers: makeProviders(),
			packageStates: [
				{
					packageName: "@ifi/pi-extension-adaptive-routing",
					label: "Adaptive routing package",
					hint: "Optional /route command and per-prompt auto routing",
					scope: "none",
					installed: false,
					selected: true,
				},
				{
					packageName: "@ifi/pi-provider-ollama",
					label: "Ollama provider package",
					hint: "Ollama local and Ollama Cloud model support",
					scope: "user",
					installed: true,
					selected: false,
				},
				{
					packageName: "@ifi/pi-provider-cursor",
					label: "Cursor provider package",
					hint: "cursor-agent provider support",
					scope: "none",
					installed: false,
					selected: false,
				},
			],
			config: {
				mode: "shadow",
				categories: {
					"quick-discovery": ["groq", "openai"],
					"planning-default": ["openai", "groq"],
					"implementation-default": ["missing-provider", "openai"],
					"research-default": ["openai", "groq"],
					"review-critical": ["openai", "groq"],
					"visual-engineering": ["cursor-agent", "openai"],
					"multimodal-default": ["openai", "groq"],
				},
			},
		});

		expect(dashboard).toContain("Adaptive routing package: selected for install");
		expect(dashboard).toContain("Ollama provider package: installed (user)");
		expect(dashboard).toContain("Cursor provider package: not installed");
		expect(dashboard).toContain("install with pi install npm:@ifi/pi-provider-cursor");
		expect(dashboard).toContain("openai/gpt-5-mini · 2 discovered models");
		expect(dashboard).toContain("groq/llama-3.3-70b-versatile");
		expect(dashboard).toContain("cursor-agent/<configured externally>");
		expect(dashboard).toContain("Quick discovery: groq → openai");
		expect(dashboard).toContain("Implementation: missing-provider → openai");
		expect(dashboard).toContain("Session default: openai/gpt-5-mini");
		expect(dashboard).toContain("scout → groq/llama-3.3-70b-versatile (Quick discovery)");
		expect(dashboard).toContain("worker, drone, backend → openai/gpt-5-mini (Implementation)");
		expect(dashboard).toContain(
			"artist, frontend-designer → cursor-agent/<configured externally> (Visual / design work)",
		);
	});

	it("shows empty provider and session-default fallbacks when routing is not configured", () => {
		const dashboard = buildRoutingDashboard({
			providers: [],
			packageStates: [],
		});

		expect(dashboard).toContain("Available providers / models:");
		expect(dashboard).toContain("- none selected yet");
		expect(dashboard).toContain("Delegated assignments:");
		expect(dashboard).toContain("delegated startup assignments not configured");
		expect(dashboard).toContain("Session default: not configured");
		expect(dashboard).toContain("scout → session default (Quick discovery)");
	});

	it("falls back to the session default when a configured category has no matching provider", () => {
		const dashboard = buildRoutingDashboard({
			providers: [{ name: "openai", apiKey: "OPENAI_API_KEY", defaultModel: "gpt-4o" }],
			packageStates: [],
			config: {
				mode: "off",
				categories: {
					"quick-discovery": ["missing-provider"],
					"planning-default": ["openai"],
					"implementation-default": ["openai"],
					"research-default": ["openai"],
					"review-critical": ["openai"],
					"visual-engineering": ["openai"],
					"multimodal-default": ["openai"],
				},
			},
		});

		expect(dashboard).toContain("scout → session default (Quick discovery)");
	});
});
