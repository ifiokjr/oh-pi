import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { discoverAgents } from "./agents.js";
import { MAX_PARALLEL } from "./types.js";

interface InlineConfig {
	output?: string | false;
	reads?: string[] | false;
	model?: string;
	skill?: string[] | false;
	progress?: boolean;
}

interface ParsedStep {
	name: string;
	config: InlineConfig;
	task?: string;
}

interface RegisterSubagentCommandsOptions {
	getBaseCwd: () => string;
	openAgentManager: (ctx: ExtensionContext) => Promise<void>;
}

function parseInlineConfig(raw: string): InlineConfig {
	const config: InlineConfig = {};
	for (const part of raw.split(",")) {
		const trimmed = part.trim();
		if (!trimmed) {
			continue;
		}
		const eq = trimmed.indexOf("=");
		if (eq === -1) {
			if (trimmed === "progress") {
				config.progress = true;
			}
			continue;
		}
		const key = trimmed.slice(0, eq).trim();
		const val = trimmed.slice(eq + 1).trim();
		switch (key) {
			case "output":
				config.output = val === "false" ? false : val;
				break;
			case "reads":
				config.reads = val === "false" ? false : val.split("+").filter(Boolean);
				break;
			case "model":
				config.model = val || undefined;
				break;
			case "skill":
			case "skills":
				config.skill = val === "false" ? false : val.split("+").filter(Boolean);
				break;
			case "progress":
				config.progress = val !== "false";
				break;
		}
	}
	return config;
}

function parseAgentToken(token: string): { name: string; config: InlineConfig } {
	const bracket = token.indexOf("[");
	if (bracket === -1) {
		return { name: token, config: {} };
	}
	const end = token.lastIndexOf("]");
	return {
		name: token.slice(0, bracket),
		config: parseInlineConfig(token.slice(bracket + 1, end !== -1 ? end : undefined)),
	};
}

function extractBgFlag(args: string): { args: string; bg: boolean } {
	if (args.endsWith(" --bg") || args === "--bg") {
		return { args: args.slice(0, args.length - (args === "--bg" ? 4 : 5)).trim(), bg: true };
	}
	return { args, bg: false };
}

function makeAgentCompletions(getBaseCwd: () => string, multiAgent: boolean) {
	return (prefix: string) => {
		const agents = discoverAgents(getBaseCwd(), "both").agents;
		if (!multiAgent) {
			if (prefix.includes(" ")) {
				return null;
			}
			return agents.filter((agent) => agent.name.startsWith(prefix)).map((agent) => ({ value: agent.name, label: agent.name }));
		}

		const lastArrow = prefix.lastIndexOf(" -> ");
		const segment = lastArrow !== -1 ? prefix.slice(lastArrow + 4) : prefix;
		if (segment.includes(" -- ") || segment.includes('"') || segment.includes("'")) {
			return null;
		}

		const lastWord = (prefix.match(/(\S*)$/) || ["", ""])[1];
		const beforeLastWord = prefix.slice(0, prefix.length - lastWord.length);
		if (lastWord === "->") {
			return agents.map((agent) => ({ value: `${prefix} ${agent.name}`, label: agent.name }));
		}
		return agents
			.filter((agent) => agent.name.startsWith(lastWord))
			.map((agent) => ({ value: `${beforeLastWord}${agent.name}`, label: agent.name }));
	};
}

function parseAgentArgs(
	args: string,
	command: string,
	ctx: ExtensionContext,
	getBaseCwd: () => string,
): { steps: ParsedStep[]; task: string } | null {
	const input = args.trim();
	const usage = `Usage: /${command} agent1 "task1" -> agent2 "task2"`;
	let steps: ParsedStep[];
	let sharedTask: string;
	let perStep = false;

	if (input.includes(" -> ")) {
		perStep = true;
		const segments = input.split(" -> ");
		steps = [];
		for (const segment of segments) {
			const trimmed = segment.trim();
			if (!trimmed) {
				continue;
			}
			let agentPart: string;
			let task: string | undefined;
			const qMatch = trimmed.match(/^(\S+(?:\[[^\]]*\])?)\s+(?:"([^"]*)"|'([^']*)')$/);
			if (qMatch) {
				agentPart = qMatch[1]!;
				task = (qMatch[2] ?? qMatch[3]) || undefined;
			} else {
				const dashIdx = trimmed.indexOf(" -- ");
				if (dashIdx !== -1) {
					agentPart = trimmed.slice(0, dashIdx).trim();
					task = trimmed.slice(dashIdx + 4).trim() || undefined;
				} else {
					agentPart = trimmed;
				}
			}
			const parsed = parseAgentToken(agentPart);
			steps.push({ ...parsed, task });
		}
		sharedTask = steps.find((step) => step.task)?.task ?? "";
	} else {
		const delimiterIndex = input.indexOf(" -- ");
		if (delimiterIndex === -1) {
			ctx.ui.notify(usage, "error");
			return null;
		}
		const agentsPart = input.slice(0, delimiterIndex).trim();
		sharedTask = input.slice(delimiterIndex + 4).trim();
		if (!agentsPart || !sharedTask) {
			ctx.ui.notify(usage, "error");
			return null;
		}
		steps = agentsPart
			.split(/\s+/)
			.filter(Boolean)
			.map((token) => parseAgentToken(token));
	}

	if (steps.length === 0) {
		ctx.ui.notify(usage, "error");
		return null;
	}

	const agents = discoverAgents(getBaseCwd(), "both").agents;
	for (const step of steps) {
		if (!agents.find((agent) => agent.name === step.name)) {
			ctx.ui.notify(`Unknown agent: ${step.name}`, "error");
			return null;
		}
	}
	if (command === "chain" && !steps[0]?.task && (perStep || !sharedTask)) {
		ctx.ui.notify("First step must have a task: /chain agent \"task\" -> agent2", "error");
		return null;
	}
	if (command === "parallel" && !steps.some((step) => step.task) && !sharedTask) {
		ctx.ui.notify("At least one step must have a task", "error");
		return null;
	}
	return { steps, task: sharedTask };
}

export function registerSubagentCommands(pi: ExtensionAPI, options: RegisterSubagentCommandsOptions): void {
	const sendToolCall = (params: Record<string, unknown>) => {
		pi.sendUserMessage(
			`Call the subagent tool with these exact parameters: ${JSON.stringify({ ...params, agentScope: "both" })}`,
		);
	};

	pi.registerCommand("agents", {
		description: "Open the Agents Manager",
		handler: async (_args, ctx) => {
			await options.openAgentManager(ctx);
		},
	});

	pi.registerCommand("run", {
		description: "Run a subagent directly: /run agent[output=file] task [--bg]",
		getArgumentCompletions: makeAgentCompletions(options.getBaseCwd, false),
		handler: async (args, ctx) => {
			const { args: cleanedArgs, bg } = extractBgFlag(args);
			const input = cleanedArgs.trim();
			const firstSpace = input.indexOf(" ");
			if (firstSpace === -1) {
				ctx.ui.notify("Usage: /run <agent> <task> [--bg]", "error");
				return;
			}
			const { name: agentName, config: inline } = parseAgentToken(input.slice(0, firstSpace));
			const task = input.slice(firstSpace + 1).trim();
			if (!task) {
				ctx.ui.notify("Usage: /run <agent> <task> [--bg]", "error");
				return;
			}

			const agents = discoverAgents(options.getBaseCwd(), "both").agents;
			if (!agents.find((agent) => agent.name === agentName)) {
				ctx.ui.notify(`Unknown agent: ${agentName}`, "error");
				return;
			}

			let finalTask = task;
			if (inline.reads && Array.isArray(inline.reads) && inline.reads.length > 0) {
				finalTask = `[Read from: ${inline.reads.join(", ")}]\n\n${finalTask}`;
			}
			const params: Record<string, unknown> = { agent: agentName, task: finalTask, clarify: false };
			if (inline.output !== undefined) params.output = inline.output;
			if (inline.skill !== undefined) params.skill = inline.skill;
			if (inline.model) params.model = inline.model;
			if (bg) params.async = true;
			sendToolCall(params);
		},
	});

	pi.registerCommand("chain", {
		description: 'Run agents in sequence: /chain scout "task" -> planner [--bg]',
		getArgumentCompletions: makeAgentCompletions(options.getBaseCwd, true),
		handler: async (args, ctx) => {
			const { args: cleanedArgs, bg } = extractBgFlag(args);
			const parsed = parseAgentArgs(cleanedArgs, "chain", ctx, options.getBaseCwd);
			if (!parsed) {
				return;
			}
			const chain = parsed.steps.map(({ name, config, task: stepTask }, index) => ({
				agent: name,
				...(stepTask ? { task: stepTask } : index === 0 && parsed.task ? { task: parsed.task } : {}),
				...(config.output !== undefined ? { output: config.output } : {}),
				...(config.reads !== undefined ? { reads: config.reads } : {}),
				...(config.model ? { model: config.model } : {}),
				...(config.skill !== undefined ? { skill: config.skill } : {}),
				...(config.progress !== undefined ? { progress: config.progress } : {}),
			}));
			const params: Record<string, unknown> = { chain, task: parsed.task, clarify: false, agentScope: "both" };
			if (bg) params.async = true;
			pi.sendUserMessage(`Call the subagent tool with these exact parameters: ${JSON.stringify(params)}`);
		},
	});

	pi.registerCommand("parallel", {
		description: 'Run agents in parallel: /parallel scout "task1" -> reviewer "task2" [--bg]',
		getArgumentCompletions: makeAgentCompletions(options.getBaseCwd, true),
		handler: async (args, ctx) => {
			const { args: cleanedArgs, bg } = extractBgFlag(args);
			const parsed = parseAgentArgs(cleanedArgs, "parallel", ctx, options.getBaseCwd);
			if (!parsed) {
				return;
			}
			if (parsed.steps.length > MAX_PARALLEL) {
				ctx.ui.notify(`Max ${MAX_PARALLEL} parallel tasks`, "error");
				return;
			}
			const tasks = parsed.steps.map(({ name, config, task: stepTask }) => ({
				agent: name,
				task: stepTask ?? parsed.task,
				...(config.output !== undefined ? { output: config.output } : {}),
				...(config.reads !== undefined ? { reads: config.reads } : {}),
				...(config.model ? { model: config.model } : {}),
				...(config.skill !== undefined ? { skill: config.skill } : {}),
				...(config.progress !== undefined ? { progress: config.progress } : {}),
			}));
			const params: Record<string, unknown> = {
				chain: [{ parallel: tasks }],
				task: parsed.task,
				clarify: false,
				agentScope: "both",
			};
			if (bg) params.async = true;
			pi.sendUserMessage(`Call the subagent tool with these exact parameters: ${JSON.stringify(params)}`);
		},
	});
}
