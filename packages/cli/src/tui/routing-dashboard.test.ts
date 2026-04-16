import type { ProviderConfig } from "@ifi/oh-pi-core";
import { describe, expect, it } from "vitest";
import { buildRoutingDashboard, detectOptionalRoutingPackages } from "./routing-dashboard.js";

function makeProviders(): ProviderConfig[] {
	return [
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
			name: "groq",
			apiKey: "GROQ_API_KEY",
			defaultModel: "llama-3.3-70b-versatile",
		},
	];
}

describe("detectOptionalRoutingPackages", () => {
	it("maps package installation state with a custom resolver", () => {
		const packages = detectOptionalRoutingPackages((packageName) => packageName === "@ifi/pi-provider-ollama");

		expect(packages.find((pkg) => pkg.packageName === "@ifi/pi-provider-ollama")?.installed).toBe(true);
		expect(packages.find((pkg) => pkg.packageName === "@ifi/pi-provider-cursor")?.installed).toBe(false);
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
					installed: true,
				},
			],
			config: {
				mode: "shadow",
				categories: {
					"quick-discovery": ["groq", "openai"],
					"planning-default": ["openai", "groq"],
					"implementation-default": ["openai", "groq"],
					"research-default": ["openai", "groq"],
					"review-critical": ["openai", "groq"],
					"visual-engineering": ["openai", "groq"],
					"multimodal-default": ["openai", "groq"],
				},
			},
		});

		expect(dashboard).toContain("Adaptive routing package: installed");
		expect(dashboard).toContain("openai/gpt-4o · 2 discovered models");
		expect(dashboard).toContain("groq/llama-3.3-70b-versatile");
		expect(dashboard).toContain("Quick discovery: groq → openai");
		expect(dashboard).toContain("Session default: openai/gpt-4o");
		expect(dashboard).toContain("scout → groq/llama-3.3-70b-versatile (Quick discovery)");
		expect(dashboard).toContain("worker, drone, backend → openai/gpt-4o (Implementation)");
	});

	it("shows session-default fallback when delegated assignments are not configured", () => {
		const dashboard = buildRoutingDashboard({
			providers: [{ name: "openai", apiKey: "OPENAI_API_KEY", defaultModel: "gpt-4o" }],
			packageStates: [],
		});

		expect(dashboard).toContain("Delegated assignments:");
		expect(dashboard).toContain("delegated startup assignments not configured");
		expect(dashboard).toContain("Session default: openai/gpt-4o");
		expect(dashboard).toContain("scout → session default (Quick discovery)");
	});
});
