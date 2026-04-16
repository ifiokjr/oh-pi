import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({ getAgentDir }));

import { resolveSubagentModelResolution } from "../model-routing.js";

const sampleModels = [
	{ provider: "google", id: "gemini-2.5-flash", fullId: "google/gemini-2.5-flash" },
	{ provider: "openai", id: "gpt-5-mini", fullId: "openai/gpt-5-mini" },
];

afterEach(() => {
	vi.clearAllMocks();
});

describe("resolveSubagentModelResolution", () => {
	it("prefers explicit runtime overrides over delegated categories", () => {
		const result = resolveSubagentModelResolution(
			{
				name: "scout",
				description: "Scout",
				systemPrompt: "Prompt",
				source: "builtin",
				filePath: "/tmp/scout.md",
				extraFields: { category: "quick-discovery" },
			},
			sampleModels,
			"openai/gpt-5-mini",
		);
		expect(result).toEqual({
			model: "openai/gpt-5-mini",
			source: "runtime-override",
			category: "quick-discovery",
		});
	});

	it("resolves delegated categories from adaptive routing config", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "subagent-routing-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			JSON.stringify(
				{
					delegatedRouting: {
						enabled: true,
						categories: {
							"quick-discovery": {
								preferredProviders: ["google", "openai"],
							},
						},
					},
				},
				null,
				2,
			),
		);

		try {
			const result = resolveSubagentModelResolution(
				{
					name: "scout",
					description: "Scout",
					systemPrompt: "Prompt",
					source: "builtin",
					filePath: "/tmp/scout.md",
					extraFields: { category: "quick-discovery" },
				},
				sampleModels,
			);
			expect(result).toEqual({
				model: "google/gemini-2.5-flash",
				source: "delegated-category",
				category: "quick-discovery",
			});
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});
});
