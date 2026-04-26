
import { resolveExecutionAgentScope } from "../agent-scope.js";

describe(resolveExecutionAgentScope, () => {
	it("defaults to both when scope is omitted", () => {
		expect(resolveExecutionAgentScope()).toBe("both");
	});

	it("passes through explicit scopes", () => {
		expect(resolveExecutionAgentScope("user")).toBe("user");
		expect(resolveExecutionAgentScope("project")).toBe("project");
		expect(resolveExecutionAgentScope("both")).toBe("both");
	});

	it("falls back to both for invalid scopes", () => {
		expect(resolveExecutionAgentScope("invalid")).toBe("both");
		expect(resolveExecutionAgentScope("")).toBe("both");
	});
});
