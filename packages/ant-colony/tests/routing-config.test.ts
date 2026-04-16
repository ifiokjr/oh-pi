import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({ getAgentDir }));

import { DEFAULT_COLONY_CATEGORIES, resolveColonyCategoryModel } from "../extensions/ant-colony/routing-config.js";

afterEach(() => {
	vi.clearAllMocks();
});

describe("resolveColonyCategoryModel", () => {
	it("ships non-Anthropic default colony categories", () => {
		expect(DEFAULT_COLONY_CATEGORIES.scout).toBe("quick-discovery");
		expect(DEFAULT_COLONY_CATEGORIES.worker).toBe("implementation-default");
		expect(DEFAULT_COLONY_CATEGORIES.soldier).toBe("review-critical");
	});

	it("resolves a model from delegated routing config", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "ant-routing-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			JSON.stringify(
				{
					delegatedRouting: {
						enabled: true,
						categories: {
							"review-critical": {
								preferredProviders: ["openai", "google"],
							},
						},
					},
				},
				null,
				2,
			),
		);

		try {
			const result = resolveColonyCategoryModel("review-critical", [
				{ provider: "google", id: "gemini-2.5-pro", fullId: "google/gemini-2.5-pro" },
				{ provider: "openai", id: "gpt-5.4", fullId: "openai/gpt-5.4" },
			]);
			expect(result).toEqual({
				model: "openai/gpt-5.4",
				category: "review-critical",
				source: "delegated-category",
			});
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});
});
