import { describe, expect, it } from "vitest";
import { parseChain, serializeChain } from "../chain-serializer.js";

describe("parseChain", () => {
	it("parses frontmatter and step configuration", () => {
		const content = `---
name: scout-plan
description: Gather context then plan
category: analysis
---

## scout
output: context.md
progress: true

Analyze {task}

## planner
reads: context.md
model: anthropic/claude-sonnet-4-5:high
skills: planning, review
progress: false

Plan using {previous}
`;

		const chain = parseChain(content, "project", "/tmp/scout-plan.chain.md");
		expect(chain.name).toBe("scout-plan");
		expect(chain.description).toBe("Gather context then plan");
		expect(chain.extraFields).toEqual({ category: "analysis" });
		expect(chain.steps).toEqual([
			{
				agent: "scout",
				task: "Analyze {task}",
				output: "context.md",
				progress: true,
			},
			{
				agent: "planner",
				task: "Plan using {previous}",
				reads: ["context.md"],
				model: "anthropic/claude-sonnet-4-5:high",
				skills: ["planning", "review"],
				progress: false,
			},
		]);
	});

	it("supports false overrides for output, reads, and skills", () => {
		const content = `---
name: no-defaults
description: Disable inherited behavior
---

## worker
output: false
reads: false
skills: false

Do the work
`;

		const chain = parseChain(content, "user", "/tmp/no-defaults.chain.md");
		expect(chain.steps).toEqual([
			{
				agent: "worker",
				task: "Do the work",
				output: false,
				reads: false,
				skills: false,
			},
		]);
	});

	it("throws when required frontmatter is missing", () => {
		expect(() => parseChain("## scout\n\nAnalyze", "project", "/tmp/bad.chain.md")).toThrow(
			/Chain frontmatter must include name and description/,
		);
	});
});

describe("serializeChain", () => {
	it("serializes chain config into markdown frontmatter and steps", () => {
		const markdown = serializeChain({
			name: "review-pipeline",
			description: "Scout and review",
			source: "project",
			filePath: "/tmp/review-pipeline.chain.md",
			extraFields: { category: "qa" },
			steps: [
				{
					agent: "scout",
					task: "Scan {task}",
					output: "context.md",
					progress: true,
				},
				{
					agent: "reviewer",
					task: "Review {previous}",
					reads: ["context.md"],
					skills: ["review"],
					progress: false,
				},
			],
		});

		expect(markdown).toContain("name: review-pipeline");
		expect(markdown).toContain("description: Scout and review");
		expect(markdown).toContain("category: qa");
		expect(markdown).toContain("## scout");
		expect(markdown).toContain("output: context.md");
		expect(markdown).toContain("progress: true");
		expect(markdown).toContain("## reviewer");
		expect(markdown).toContain("reads: context.md");
		expect(markdown).toContain("skills: review");
		expect(markdown).toContain("progress: false");
		expect(markdown.endsWith("\n")).toBe(true);
	});

	it("round-trips through parseChain", () => {
		const original = {
			name: "roundtrip",
			description: "Round trip",
			source: "user" as const,
			filePath: "/tmp/roundtrip.chain.md",
			steps: [
				{ agent: "scout", task: "Inspect {task}", output: "context.md" },
				{ agent: "planner", task: "Plan {previous}", reads: ["context.md"] },
			],
		};

		const serialized = serializeChain(original);
		const parsed = parseChain(serialized, "user", original.filePath);
		expect(parsed.name).toBe(original.name);
		expect(parsed.description).toBe(original.description);
		expect(parsed.steps).toEqual(original.steps);
	});
});
