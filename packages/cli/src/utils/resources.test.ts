import { describe, expect, it } from "vitest";
import { resources } from "./resources.js";

describe("resources", () => {
	it("agent returns correct path", () => {
		const p = resources.agent("foo");
		expect(p).toContain("agents/foo.md");
		expect(p.startsWith("/")).toBe(true);
	});

	it("extension returns correct path", () => {
		const p = resources.extension("bar");
		expect(p).toContain("extensions/bar");
		expect(p.startsWith("/")).toBe(true);
	});

	it("extensionFile returns correct path", () => {
		const p = resources.extensionFile("baz");
		expect(p).toContain("extensions/baz.ts");
		expect(p.startsWith("/")).toBe(true);
	});

	it("diagnosticsDir returns correct path", () => {
		const p = resources.diagnosticsDir();
		expect(/(?:packages\/diagnostics|node_modules\/@ifi\/pi-diagnostics)(?:\/|$)/.test(p)).toBe(true);
		expect(p.startsWith("/")).toBe(true);
	});

	it("planDir returns correct path", () => {
		const p = resources.planDir();
		expect(/(?:packages\/plan|node_modules\/@ifi\/pi-plan)(?:\/|$)/.test(p)).toBe(true);
		expect(p.startsWith("/")).toBe(true);
	});

	it("sharedQnaDir returns correct path", () => {
		const p = resources.sharedQnaDir();
		expect(/(?:packages\/shared-qna|node_modules\/@ifi\/pi-shared-qna)(?:\/|$)/.test(p)).toBe(true);
		expect(p.startsWith("/")).toBe(true);
	});

	it("subagentsDir returns correct path", () => {
		const p = resources.subagentsDir();
		expect(/(?:packages\/subagents|node_modules\/@ifi\/pi-extension-subagents)(?:\/|$)/.test(p)).toBe(true);
		expect(p.startsWith("/")).toBe(true);
	});

	it("prompt returns correct path", () => {
		const p = resources.prompt("test");
		expect(p).toContain("prompts/test.md");
		expect(p.startsWith("/")).toBe(true);
	});

	it("skill returns correct path", () => {
		const p = resources.skill("sk");
		expect(p).toContain("skills/sk");
		expect(p.startsWith("/")).toBe(true);
	});

	it("skillsDir returns correct path", () => {
		const p = resources.skillsDir();
		expect(p).toContain("skills");
		expect(p.startsWith("/")).toBe(true);
	});

	it("theme returns correct path", () => {
		const p = resources.theme("dark");
		expect(p).toContain("themes/dark.json");
		expect(p.startsWith("/")).toBe(true);
	});
});
