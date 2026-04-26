import { resources } from "./resources.js";

describe(resources, () => {
	it("agent returns correct path", () => {
		const p = resources.agent("foo");
		expect(p).toContain("agents/foo.md");
		expect(p.startsWith("/")).toBeTruthy();
	});

	it("extension returns correct path", () => {
		const p = resources.extension("bar");
		expect(p).toContain("extensions/bar");
		expect(p.startsWith("/")).toBeTruthy();
	});

	it("extensionFile returns correct path", () => {
		const p = resources.extensionFile("baz");
		expect(p).toContain("extensions/baz.ts");
		expect(p.startsWith("/")).toBeTruthy();
	});

	it("diagnosticsDir returns correct path", () => {
		const p = resources.diagnosticsDir();
		expect(/(?:packages\/diagnostics|node_modules\/@ifi\/pi-diagnostics)(?:\/|$)/.test(p)).toBeTruthy();
		expect(p.startsWith("/")).toBeTruthy();
	});

	it("planDir returns correct path", () => {
		const p = resources.planDir();
		expect(/(?:packages\/plan|node_modules\/@ifi\/pi-plan)(?:\/|$)/.test(p)).toBeTruthy();
		expect(p.startsWith("/")).toBeTruthy();
	});

	it("sharedQnaDir returns correct path", () => {
		const p = resources.sharedQnaDir();
		expect(/(?:packages\/shared-qna|node_modules\/@ifi\/pi-shared-qna)(?:\/|$)/.test(p)).toBeTruthy();
		expect(p.startsWith("/")).toBeTruthy();
	});

	it("subagentsDir returns correct path", () => {
		const p = resources.subagentsDir();
		expect(/(?:packages\/subagents|node_modules\/@ifi\/pi-extension-subagents)(?:\/|$)/.test(p)).toBeTruthy();
		expect(p.startsWith("/")).toBeTruthy();
	});

	it("prompt returns correct path", () => {
		const p = resources.prompt("test");
		expect(p).toContain("prompts/test.md");
		expect(p.startsWith("/")).toBeTruthy();
	});

	it("skill returns correct path", () => {
		const p = resources.skill("sk");
		expect(p).toContain("skills/sk");
		expect(p.startsWith("/")).toBeTruthy();
	});

	it("skillsDir returns correct path", () => {
		const p = resources.skillsDir();
		expect(p).toContain("skills");
		expect(p.startsWith("/")).toBeTruthy();
	});

	it("theme returns correct path", () => {
		const p = resources.theme("dark");
		expect(p).toContain("themes/dark.json");
		expect(p.startsWith("/")).toBeTruthy();
	});
});
