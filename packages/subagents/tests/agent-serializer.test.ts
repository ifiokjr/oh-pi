import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serializeAgent, updateFrontmatterField } from "../agent-serializer.js";

const tempDirs: string[] = [];

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function createAgentFile(content: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-agent-serializer-"));
	tempDirs.push(dir);
	const filePath = path.join(dir, "agent.md");
	fs.writeFileSync(filePath, content, "utf-8");
	return filePath;
}

describe("serializeAgent", () => {
	it("serializes tools, mcp tools, skills, extensions, and extra fields", () => {
		const serialized = serializeAgent({
			name: "scout",
			description: "Fast recon",
			tools: ["read", "bash"],
			mcpDirectTools: ["github/search_repositories"],
			model: "claude-haiku-4-5",
			thinking: "high",
			systemPrompt: "You are a scout.",
			source: "user",
			filePath: "/tmp/scout.md",
			skills: ["safe-bash", "context7"],
			extensions: ["/abs/ext-a.ts"],
			output: "context.md",
			defaultReads: ["context.md"],
			defaultProgress: true,
			interactive: true,
			extraFields: { category: "analysis" },
		});

		expect(serialized).toContain("name: scout");
		expect(serialized).toContain("description: Fast recon");
		expect(serialized).toContain("tools: read, bash, mcp:github/search_repositories");
		expect(serialized).toContain("model: claude-haiku-4-5");
		expect(serialized).toContain("thinking: high");
		expect(serialized).toContain("skills: safe-bash, context7");
		expect(serialized).toContain("extensions: /abs/ext-a.ts");
		expect(serialized).toContain("output: context.md");
		expect(serialized).toContain("defaultReads: context.md");
		expect(serialized).toContain("defaultProgress: true");
		expect(serialized).toContain("interactive: true");
		expect(serialized).toContain("category: analysis");
		expect(serialized).toContain("You are a scout.");
	});

	it("omits thinking when it is off", () => {
		const serialized = serializeAgent({
			name: "worker",
			description: "Executes work",
			systemPrompt: "Prompt",
			source: "user",
			filePath: "/tmp/worker.md",
			thinking: "off",
		});

		expect(serialized).not.toContain("thinking:");
	});
});

describe("updateFrontmatterField", () => {
	it("updates an existing field in frontmatter", () => {
		const filePath = createAgentFile("---\nname: scout\ndescription: Scout\nmodel: old-model\n---\n\nPrompt\n");
		updateFrontmatterField(filePath, "model", "new-model");
		expect(fs.readFileSync(filePath, "utf-8")).toContain("model: new-model");
		expect(fs.readFileSync(filePath, "utf-8")).not.toContain("model: old-model");
	});

	it("normalizes skill updates to the skills field", () => {
		const filePath = createAgentFile("---\nname: scout\ndescription: Scout\nskill: old-skill\n---\n\nPrompt\n");
		updateFrontmatterField(filePath, "skill", "safe-bash, context7");
		const content = fs.readFileSync(filePath, "utf-8");
		expect(content).toContain("skills: safe-bash, context7");
		expect(content).not.toContain("skill: old-skill");
	});

	it("adds a missing field when it does not exist", () => {
		const filePath = createAgentFile("---\nname: scout\ndescription: Scout\n---\n\nPrompt\n");
		updateFrontmatterField(filePath, "model", "claude-sonnet-4");
		expect(fs.readFileSync(filePath, "utf-8")).toContain("model: claude-sonnet-4");
	});

	it("removes a field when the new value is undefined", () => {
		const filePath = createAgentFile("---\nname: scout\ndescription: Scout\nmodel: claude-sonnet-4\n---\n\nPrompt\n");
		updateFrontmatterField(filePath, "model", undefined);
		expect(fs.readFileSync(filePath, "utf-8")).not.toContain("model:");
	});
});
