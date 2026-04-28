import { describe, expect, it, vi } from "vitest";

const discoverAgentsMock = vi.hoisted(() => vi.fn());

vi.mock("../agents.js", () => ({
	discoverAgents: discoverAgentsMock,
}));

vi.mock("../types.js", () => ({
	MAX_PARALLEL: 2,
}));

import { registerSubagentCommands } from "../command-registration.js";

function createPi() {
	const commands = new Map<string, any>();
	return {
		commands,
		registerCommand: vi.fn((name: string, spec: any) => {
			commands.set(name, spec);
		}),
		registerShortcut: vi.fn(),
		sendUserMessage: vi.fn(),
	};
}

function createCtx() {
	const notifications: Array<{ msg: string; level: string }> = [];
	return {
		notifications,
		ui: {
			notify: (msg: string, level: string) => {
				notifications.push({ msg, level });
			},
		},
	};
}

describe("registerSubagentCommands", () => {
	it("opens the agent manager and offers agent completions", async () => {
		discoverAgentsMock.mockReturnValue({
			agents: [{ name: "scout" }, { name: "planner" }, { name: "reviewer" }],
		});
		const pi = createPi();
		const openAgentManager = vi.fn(async () => {});
		registerSubagentCommands(pi as never, {
			getBaseCwd: () => "/repo",
			openAgentManager,
		});

		await pi.commands.get("agents").handler("", {});
		expect(openAgentManager).toHaveBeenCalledTimes(1);

		const completions = pi.commands.get("run").getArgumentCompletions("pl");
		expect(completions).toEqual([{ value: "planner", label: "planner" }]);
	});

	it("validates /run and sends exact single-agent tool calls", async () => {
		discoverAgentsMock.mockReturnValue({
			agents: [{ name: "scout" }, { name: "planner" }],
		});
		const pi = createPi();
		const ctx = createCtx();
		registerSubagentCommands(pi as never, {
			getBaseCwd: () => "/repo",
			openAgentManager: vi.fn(),
		});

		await pi.commands.get("run").handler("unknown investigate", ctx);
		expect(ctx.notifications.at(-1)).toEqual({
			msg: "Unknown agent: unknown",
			level: "error",
		});

		await pi.commands
			.get("run")
			.handler(
				"scout[output=notes.md,reads=spec.md+design.md,skill=context7+git,model=anthropic/claude-sonnet-4] inspect api --bg",
				ctx,
			);

		const sent = pi.sendUserMessage.mock.calls.at(-1)?.[0];
		expect(sent).toContain('"agent":"scout"');
		expect(sent).toContain('"task":"[Read from: spec.md, design.md]\\n\\ninspect api"');
		expect(sent).toContain('"output":"notes.md"');
		expect(sent).toContain('"skill":["context7","git"]');
		expect(sent).toContain('"model":"anthropic/claude-sonnet-4"');
		expect(sent).toContain('"async":true');
		expect(sent).toContain('"agentScope":"both"');
	});

	it("builds sequential chain calls with inline overrides", async () => {
		discoverAgentsMock.mockReturnValue({
			agents: [{ name: "scout" }, { name: "planner" }, { name: "reviewer" }],
		});
		const pi = createPi();
		const ctx = createCtx();
		registerSubagentCommands(pi as never, {
			getBaseCwd: () => "/repo",
			openAgentManager: vi.fn(),
		});

		await pi.commands
			.get("chain")
			.handler(
				'scout[progress] "inspect repo" -> planner[output=plan.md,reads=false,skills=context7+git,model=openai/gpt-5] "draft plan" --bg',
				ctx,
			);

		expect(pi.sendUserMessage).toHaveBeenLastCalledWith(
			'Call the subagent tool with these exact parameters: {"chain":[{"agent":"scout","task":"inspect repo","progress":true},{"agent":"planner","task":"draft plan","output":"plan.md","reads":false,"model":"openai/gpt-5","skill":["context7","git"]}],"task":"inspect repo","clarify":false,"agentScope":"both","async":true}',
		);

		const completions = pi.commands.get("chain").getArgumentCompletions("scout -> pl");
		expect(completions).toEqual([
			{
				value: "scout -> planner",
				label: "planner",
			},
		]);
	});

	it("builds parallel chain calls and enforces the parallel cap", async () => {
		discoverAgentsMock.mockReturnValue({
			agents: [{ name: "scout" }, { name: "planner" }, { name: "reviewer" }],
		});
		const pi = createPi();
		const ctx = createCtx();
		registerSubagentCommands(pi as never, {
			getBaseCwd: () => "/repo",
			openAgentManager: vi.fn(),
		});

		await pi.commands.get("parallel").handler('scout "inspect" -> planner "plan" -> reviewer "review"', ctx);
		expect(ctx.notifications.at(-1)).toEqual({
			msg: "Max 2 parallel tasks",
			level: "error",
		});

		await pi.commands
			.get("parallel")
			.handler('scout[progress] "inspect" -> planner[skill=false,model=anthropic/claude-sonnet-4] "plan" --bg', ctx);
		expect(pi.sendUserMessage).toHaveBeenLastCalledWith(
			'Call the subagent tool with these exact parameters: {"chain":[{"parallel":[{"agent":"scout","task":"inspect","progress":true},{"agent":"planner","task":"plan","model":"anthropic/claude-sonnet-4","skill":false}]}],"task":"inspect","clarify":false,"agentScope":"both","async":true}',
		);
	});
});
