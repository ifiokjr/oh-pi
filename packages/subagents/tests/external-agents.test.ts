/**
 * Tests for external agent protocol resolution
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveExternalAgent } from "../external-agents.js";

describe("resolveExternalAgent", () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-external-agents-"));
		process.chdir(tmpDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns undefined when no external configs exist", () => {
		const result = resolveExternalAgent("nonexistent", tmpDir);
		expect(result).toBeUndefined();
	});

	// -------------------------------------------------------------------
	// VS Code agents.json
	// -------------------------------------------------------------------

	describe("VS Code method (.vscode/agents.json)", () => {
		it("resolves an agent from .vscode/agents.json", () => {
			const agentsDir = path.join(tmpDir, ".vscode");
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(
				path.join(agentsDir, "agents.json"),
				JSON.stringify({
					agents: [
						{
							name: "devenv-scout",
							systemPrompt: "You are a devenv config expert.",
							description: "Finds devenv files",
							tools: ["read", "bash", "grep"],
						},
					],
				}),
			);

			const result = resolveExternalAgent("devenv-scout", tmpDir);
			expect(result).toBeDefined();
			expect(result!.source).toBe("vscode");
			expect(result!.config.name).toBe("devenv-scout");
			expect(result!.config.systemPrompt).toBe("You are a devenv config expert.");
			expect(result!.config.description).toBe("Finds devenv files");
		});

		it("returns undefined for unmatched name in .vscode/agents.json", () => {
			const agentsDir = path.join(tmpDir, ".vscode");
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(
				path.join(agentsDir, "agents.json"),
				JSON.stringify({ agents: [{ name: "other", systemPrompt: "..." }] }),
			);

			const result = resolveExternalAgent("devenv-scout", tmpDir);
			expect(result).toBeUndefined();
		});

		it("handles invalid JSON in .vscode/agents.json", () => {
			const agentsDir = path.join(tmpDir, ".vscode");
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(path.join(agentsDir, "agents.json"), "not json");

			const result = resolveExternalAgent("any", tmpDir);
			expect(result).toBeUndefined();
		});

		it("handles missing agents array in .vscode/agents.json", () => {
			const agentsDir = path.join(tmpDir, ".vscode");
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(path.join(agentsDir, "agents.json"), JSON.stringify({ something: "else" }));

			const result = resolveExternalAgent("any", tmpDir);
			expect(result).toBeUndefined();
		});
	});

	// -------------------------------------------------------------------
	// Claude Code method (.claude/agents/<name>.md)
	// -------------------------------------------------------------------

	describe("Claude Code method (.claude/agents/<name>.md)", () => {
		it("resolves an agent from .claude/agents/<name>.md", () => {
			const agentsDir = path.join(tmpDir, ".claude", "agents");
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(path.join(agentsDir, "devenv-scout.md"), "You are a Claude Code agent for devenv exploration.");

			const result = resolveExternalAgent("devenv-scout", tmpDir);
			expect(result).toBeDefined();
			expect(result!.source).toBe("claude-code");
			expect(result!.config.systemPrompt).toBe("You are a Claude Code agent for devenv exploration.");
		});

		it("resolves an agent with YAML-like frontmatter", () => {
			const agentsDir = path.join(tmpDir, ".claude", "agents");
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(
				path.join(agentsDir, "scout.md"),
				"---\ndescription: Codebase explorer\ntools: [read, bash, grep]\n---\n\nYou are a scout agent.",
			);

			const result = resolveExternalAgent("scout", tmpDir);
			expect(result).toBeDefined();
			expect(result!.config.description).toBe("Codebase explorer");
			expect(result!.config.systemPrompt).toBe("You are a scout agent.");
		});

		it("returns undefined when .claude directory does not exist", () => {
			const result = resolveExternalAgent("any", tmpDir);
			expect(result).toBeUndefined();
		});
	});

	// -------------------------------------------------------------------
	// Open Code method (.opencode/agents/<name>.md)
	// -------------------------------------------------------------------

	describe("Open Code method (.opencode/agents/<name>.md)", () => {
		it("resolves an agent from .opencode/agents/<name>.md", () => {
			const agentsDir = path.join(tmpDir, ".opencode", "agents");
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(path.join(agentsDir, "builder.md"), "You are an Open Code build agent.");

			const result = resolveExternalAgent("builder", tmpDir);
			expect(result).toBeDefined();
			expect(result!.source).toBe("open-code");
			expect(result!.config.systemPrompt).toBe("You are an Open Code build agent.");
		});
	});

	// -------------------------------------------------------------------
	// pi project method (.pi/agents/<name>.md)
	// -------------------------------------------------------------------

	describe("pi project method (.pi/agents/<name>.md)", () => {
		it("resolves an agent from .pi/agents/<name>.md", () => {
			const agentsDir = path.join(tmpDir, ".pi", "agents");
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(path.join(agentsDir, "reviewer.md"), "You are a pi code reviewer.");

			const result = resolveExternalAgent("reviewer", tmpDir);
			expect(result).toBeDefined();
			expect(result!.source).toBe("pi-project");
			expect(result!.config.systemPrompt).toBe("You are a pi code reviewer.");
		});
	});

	// -------------------------------------------------------------------
	// Priority order
	// -------------------------------------------------------------------

	describe("priority order", () => {
		it("pi-project takes priority over vscode", () => {
			// .pi
			const piDir = path.join(tmpDir, ".pi", "agents");
			fs.mkdirSync(piDir, { recursive: true });
			fs.writeFileSync(path.join(piDir, "scout.md"), "pi project scout");

			// .vscode
			const vscodeDir = path.join(tmpDir, ".vscode");
			fs.mkdirSync(vscodeDir, { recursive: true });
			fs.writeFileSync(
				path.join(vscodeDir, "agents.json"),
				JSON.stringify({
					agents: [{ name: "scout", systemPrompt: "vscode scout" }],
				}),
			);

			const result = resolveExternalAgent("scout", tmpDir);
			expect(result).toBeDefined();
			expect(result!.source).toBe("pi-project");
			expect(result!.config.systemPrompt).toBe("pi project scout");
		});

		it("vscode takes priority over claude-code", () => {
			// .vscode
			const vscodeDir = path.join(tmpDir, ".vscode");
			fs.mkdirSync(vscodeDir, { recursive: true });
			fs.writeFileSync(
				path.join(vscodeDir, "agents.json"),
				JSON.stringify({
					agents: [{ name: "scout", systemPrompt: "vscode scout" }],
				}),
			);

			// .claude
			const claudeDir = path.join(tmpDir, ".claude", "agents");
			fs.mkdirSync(claudeDir, { recursive: true });
			fs.writeFileSync(path.join(claudeDir, "scout.md"), "claude scout");

			const result = resolveExternalAgent("scout", tmpDir);
			expect(result).toBeDefined();
			expect(result!.source).toBe("vscode");
			expect(result!.config.systemPrompt).toBe("vscode scout");
		});
	});

	// -------------------------------------------------------------------
	// Walking up the directory tree
	// -------------------------------------------------------------------

	describe("walks up the directory tree", () => {
		it("finds config in a parent directory", () => {
			const childDir = path.join(tmpDir, "deep", "nested", "project");
			fs.mkdirSync(childDir, { recursive: true });

			const piDir = path.join(tmpDir, ".pi", "agents");
			fs.mkdirSync(piDir, { recursive: true });
			fs.writeFileSync(path.join(piDir, "scout.md"), "found via walk");

			const result = resolveExternalAgent("scout", childDir);
			expect(result).toBeDefined();
			expect(result!.source).toBe("pi-project");
			expect(result!.config.systemPrompt).toBe("found via walk");
		});
	});
});
