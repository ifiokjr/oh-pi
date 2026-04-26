import type { AgentConfig } from "./agents.js";

export interface AgentTemplate {
	name: string;
	config: Partial<AgentConfig>;
}

export type TemplateItem =
	| { type: "agent"; name: string; config: Partial<AgentConfig> }
	| { type: "chain"; name: string; description: string }
	| { type: "separator"; label: string };

export const TEMPLATE_ITEMS: TemplateItem[] = [
	{ label: "Agents", type: "separator" },
	{
		config: { description: "Describe this agent", systemPrompt: "" },
		name: "Blank",
		type: "agent",
	},
	{
		config: {
			description: "Analyzes codebases and reports findings",
			output: "analysis.md",
			systemPrompt:
				"You are a code analysis agent. Given a codebase and a question, thoroughly investigate the relevant files and report your findings. Focus on accuracy — read the actual code rather than guessing.",
			tools: ["read", "bash"],
		},
		name: "Scout",
		type: "agent",
	},
	{
		config: {
			description: "Reviews code for bugs, style, and correctness",
			systemPrompt:
				"You are a code review agent. Examine the code changes or files provided and identify bugs, style issues, performance concerns, and correctness problems. Be specific — cite line numbers and explain why each issue matters.",
			tools: ["read", "bash"],
		},
		name: "Code Reviewer",
		type: "agent",
	},
	{
		config: {
			description: "Creates implementation plans from requirements",
			output: "plan.md",
			systemPrompt:
				"You are a planning agent. Given a task or requirements, create a detailed implementation plan. Break the work into concrete steps, identify which files need changes, and note any risks or dependencies.",
			tools: ["read", "bash"],
		},
		name: "Planner",
		type: "agent",
	},
	{
		config: {
			defaultProgress: true,
			description: "Implements code changes from a plan",
			systemPrompt:
				"You are an implementation agent. Given a plan or task, make the necessary code changes. Write clean, tested code that follows existing patterns. Run tests after making changes.",
		},
		name: "Implementer",
		type: "agent",
	},
	{ label: "Chains", type: "separator" },
	{ description: "Empty chain to configure", name: "Blank Chain", type: "chain" },
];
