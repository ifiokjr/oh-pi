import { describe, expect, it } from "vitest";

import { resources } from "./resources.js";

describe("resources", () => {
	it("agent returns correct path", () => {
		const p = resources.agent("foo");
		expect(p).toContain("agents/foo.md");
		expect(p.startsWith("/")).toBe(true);
	});

	it("extension returns correct path", () => {
		const p = resources.extension("worktree");
		expect(
			/(?:packages\/monopi__extension-worktree|node_modules\/@monopi\/extension-worktree)\/index\.ts$/.test(p),
		).toBe(true);
		expect(p.startsWith("/")).toBe(true);
	});

	it("extensionFile returns correct path", () => {
		const p = resources.extensionFile("worktree");
		expect(
			/(?:packages\/monopi__extension-worktree|node_modules\/@monopi\/extension-worktree)\/index\.ts$/.test(p),
		).toBe(true);
		expect(p.startsWith("/")).toBe(true);
	});

	it("diagnosticsDir returns correct path", () => {
		const p = resources.diagnosticsDir();
		expect(/(?:packages\/monopi__diagnostics|node_modules\/@monopi\/diagnostics)(?:\/|$)/.test(p)).toBe(true);
		expect(p.startsWith("/")).toBe(true);
	});

	it("sharedQnaDir returns correct path", () => {
		const p = resources.sharedQnaDir();
		expect(/(?:packages\/monopi__shared-qna|node_modules\/@monopi\/shared-qna)(?:\/|$)/.test(p)).toBe(true);
		expect(p.startsWith("/")).toBe(true);
	});

	it("subagentsDir returns correct path", () => {
		const p = resources.subagentsDir();
		expect(/(?:packages\/monopi__subagents|node_modules\/@ifi\/pi-extension-subagents)(?:\/|$)/.test(p)).toBe(true);
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
});
