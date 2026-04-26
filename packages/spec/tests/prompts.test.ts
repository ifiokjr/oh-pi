import { describe, expect, it } from "vitest";
import { buildWorkflowPrompt, getStepNotes } from "../extension/prompts.js";
import { buildWorkflowPaths } from "../extension/workspace.js";

describe("workflow prompt builder", () => {
	it("embeds native runtime notes, prepared paths, and checklist summaries", () => {
		const paths = buildWorkflowPaths("/repo", "001-auth-flow");
		const prompt = buildWorkflowPrompt({
			step: "implement",
			input: "Focus on MVP tasks first",
			paths,
			currentBranch: "001-auth-flow",
			workflowTemplatePath: "/repo/.specify/templates/commands/implement.md",
			stepNotes: getStepNotes("implement"),
			checklists: [
				{
					name: "requirements.md",
					path: "/repo/specs/001-auth-flow/checklists/requirements.md",
					total: 4,
					completed: 3,
					incomplete: 1,
					status: "fail",
				},
			],
		});

		expect(prompt).toContain("Do NOT run any shell or PowerShell scripts");
		expect(prompt).toContain("/repo/.specify/templates/commands/implement.md");
		expect(prompt).toContain("/repo/.specify/memory/pi-agent.md");
		expect(prompt).toContain("requirements.md: FAIL (3/4 complete, 1 incomplete)");
		expect(prompt).toContain("Focus on MVP tasks first");
	});
});
