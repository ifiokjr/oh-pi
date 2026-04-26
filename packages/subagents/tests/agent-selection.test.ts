import { mergeAgentsForScope } from "../agent-selection.js";

interface TestAgent {
	name: string;
	source: "builtin" | "user" | "project";
	systemPrompt: string;
}

function makeAgent(name: string, source: TestAgent["source"], systemPrompt: string): TestAgent {
	return { name, source, systemPrompt };
}

describe(mergeAgentsForScope, () => {
	it("returns project agents when scope is project", () => {
		const userAgents = [makeAgent("shared", "user", "user prompt")];
		const projectAgents = [makeAgent("shared", "project", "project prompt")];
		const result = mergeAgentsForScope("project", userAgents as never[], projectAgents as never[]);
		expect(result).toHaveLength(1);
		expect(result[0]?.source).toBe("project");
	});

	it("returns user agents when scope is user", () => {
		const userAgents = [makeAgent("shared", "user", "user prompt")];
		const projectAgents = [makeAgent("shared", "project", "project prompt")];
		const result = mergeAgentsForScope("user", userAgents as never[], projectAgents as never[]);
		expect(result).toHaveLength(1);
		expect(result[0]?.source).toBe("user");
	});

	it("prefers project agents on name collisions when scope is both", () => {
		const userAgents = [makeAgent("shared", "user", "user prompt")];
		const projectAgents = [makeAgent("shared", "project", "project prompt")];
		const result = mergeAgentsForScope("both", userAgents as never[], projectAgents as never[]);
		expect(result).toHaveLength(1);
		expect(result[0]?.source).toBe("project");
		expect(result[0]?.systemPrompt).toBe("project prompt");
	});

	it("keeps agents from both scopes when names are distinct", () => {
		const userAgents = [makeAgent("user-only", "user", "user prompt")];
		const projectAgents = [makeAgent("project-only", "project", "project prompt")];
		const result = mergeAgentsForScope("both", userAgents as never[], projectAgents as never[]);
		expect(result).toHaveLength(2);
		expect(result.some((agent) => agent.name === "user-only" && agent.source === "user")).toBeTruthy();
		expect(result.some((agent) => agent.name === "project-only" && agent.source === "project")).toBeTruthy();
	});

	it("includes builtin agents when no user or project override exists", () => {
		const builtinAgents = [makeAgent("scout", "builtin", "builtin prompt")];
		const result = mergeAgentsForScope("both", [] as never[], [] as never[], builtinAgents as never[]);
		expect(result).toHaveLength(1);
		expect(result[0]?.source).toBe("builtin");
	});

	it("user agents override builtins with the same name", () => {
		const builtinAgents = [makeAgent("scout", "builtin", "builtin prompt")];
		const userAgents = [makeAgent("scout", "user", "custom prompt")];
		const result = mergeAgentsForScope("both", userAgents as never[], [] as never[], builtinAgents as never[]);
		expect(result).toHaveLength(1);
		expect(result[0]?.source).toBe("user");
		expect(result[0]?.systemPrompt).toBe("custom prompt");
	});

	it("project agents override builtins with the same name", () => {
		const builtinAgents = [makeAgent("scout", "builtin", "builtin prompt")];
		const projectAgents = [makeAgent("scout", "project", "project prompt")];
		const result = mergeAgentsForScope("both", [] as never[], projectAgents as never[], builtinAgents as never[]);
		expect(result).toHaveLength(1);
		expect(result[0]?.source).toBe("project");
	});
});
