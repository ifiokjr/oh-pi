import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ifi/pi-extension-subagents/execution.ts", () => ({
	runSync: vi.fn(),
}));

vi.mock("@ifi/pi-extension-subagents/utils.ts", () => ({
	getFinalOutput: vi.fn(),
}));

import { runSync } from "@ifi/pi-extension-subagents/execution.ts";
import { getFinalOutput } from "@ifi/pi-extension-subagents/utils.ts";
import { buildTaskAgentRunDetails, normalizeTaskAgentTasks, registerTaskAgentTools } from "../task-agents.js";

type MockRunSync = typeof runSync & ReturnType<typeof vi.fn>;
type MockGetFinalOutput = typeof getFinalOutput & ReturnType<typeof vi.fn>;

function makeSingleResult(exitCode: number, error?: string) {
	return {
		agent: "plan-researcher",
		task: "Task",
		exitCode,
		messages: [],
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
		error,
	};
}

function registerTools(getState = () => ({ active: true })) {
	const tools = new Map<string, any>();
	registerTaskAgentTools(
		{
			getActiveTools: () => ["read", "grep", "find", "ls", "bash", "web_search"],
			registerTool: (tool: { name: string }) => {
				tools.set(tool.name, tool);
			},
		} as any,
		{
			getState,
			taskAgentsSchema: {},
			steerTaskAgentSchema: {},
		},
	);
	return tools;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("normalizeTaskAgentTasks", () => {
	it("sanitizes and deduplicates task ids", () => {
		const normalized = normalizeTaskAgentTasks([
			{ id: "Auth Scan", prompt: "Inspect auth" },
			{ id: "Auth Scan", prompt: "Inspect auth tests" },
			{ prompt: "Inspect docs" },
		]);

		expect(normalized.map((task) => task.id)).toEqual(["auth-scan", "auth-scan-2", "task-3"]);
	});
});

describe("buildTaskAgentRunDetails", () => {
	it("counts successful tasks", () => {
		const details = buildTaskAgentRunDetails("run-1", [
			{
				taskId: "task-1",
				task: "One",
				cwd: "/tmp",
				output: "ok",
				references: [],
				exitCode: 0,
				stderr: "",
				activities: [],
				startedAt: 1,
				finishedAt: 2,
				steeringNotes: [],
			},
			{
				taskId: "task-2",
				task: "Two",
				cwd: "/tmp",
				output: "",
				references: [],
				exitCode: 1,
				stderr: "failed",
				activities: [],
				startedAt: 1,
				finishedAt: 2,
				steeringNotes: [],
			},
		]);

		expect(details.successCount).toBe(1);
		expect(details.totalCount).toBe(2);
	});
});

describe("task agent tool registration", () => {
	it("registers both planning task tools", () => {
		const tools = registerTools();
		expect(Array.from(tools.keys()).sort()).toEqual(["steer_task_agent", "task_agents"]);
	});

	it("rejects task_agents when plan mode is inactive", async () => {
		const tools = registerTools(() => ({ active: false }));
		const taskAgentsTool = tools.get("task_agents");
		const result = await taskAgentsTool.execute(
			"call-1",
			{ tasks: [{ prompt: "Inspect auth" }] },
			undefined,
			undefined,
			{ cwd: "/repo" },
		);

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("only available while plan mode is active");
	});
});

describe("task_agents tool", () => {
	it("runs planning tasks through the bundled subagent runtime", async () => {
		const tools = registerTools();
		const taskAgentsTool = tools.get("task_agents");
		(runSync as MockRunSync).mockResolvedValueOnce(makeSingleResult(0)).mockResolvedValueOnce(makeSingleResult(0));
		(getFinalOutput as MockGetFinalOutput)
			.mockReturnValueOnce("Summary A\n\nReferences:\n- src/auth.ts")
			.mockReturnValueOnce("Summary B\n\nReferences:\n- docs/plan.md");

		const result = await taskAgentsTool.execute(
			"call-1",
			{
				tasks: [
					{ id: "task-a", prompt: "Inspect auth", cwd: "/repo" },
					{ id: "task-b", prompt: "Inspect docs", cwd: "/repo/docs" },
				],
				concurrency: 2,
			},
			undefined,
			undefined,
			{ cwd: "/repo" },
		);

		expect(result.isError).toBe(false);
		expect(runSync).toHaveBeenCalledTimes(2);
		expect((runSync as MockRunSync).mock.calls[0]?.[2]).toBe("plan-researcher");
		expect((runSync as MockRunSync).mock.calls[0]?.[3]).toContain("Task ID: task-a");
		expect((runSync as MockRunSync).mock.calls[0]?.[0]).toBe("/repo");
		expect((runSync as MockRunSync).mock.calls[0]?.[4]).toMatchObject({ cwd: "/repo", index: 0 });
		expect(result.details.successCount).toBe(2);
		expect(result.details.tasks[0]?.taskId).toBe("task-a");
		expect(result.details.tasks[0]?.references).toContain("src/auth.ts");
		expect(result.content[0]?.text).toContain("Use steer_task_agent");
	});

	it("marks the overall result as error when any delegated task fails", async () => {
		const tools = registerTools();
		const taskAgentsTool = tools.get("task_agents");
		(runSync as MockRunSync)
			.mockResolvedValueOnce(makeSingleResult(0))
			.mockResolvedValueOnce(makeSingleResult(1, "failed to inspect"));
		(getFinalOutput as MockGetFinalOutput).mockReturnValueOnce("Summary A").mockReturnValueOnce("Partial output");

		const result = await taskAgentsTool.execute(
			"call-1",
			{
				tasks: [{ prompt: "Inspect auth" }, { prompt: "Inspect docs" }],
				concurrency: 2,
			},
			undefined,
			undefined,
			{ cwd: "/repo" },
		);

		expect(result.isError).toBe(true);
		expect(result.details.successCount).toBe(1);
		expect(result.details.tasks[1]?.stderr).toBe("failed to inspect");
	});
});

describe("steer_task_agent", () => {
	it("reruns a previous task with extra steering via the subagent runtime", async () => {
		const tools = registerTools();
		const taskAgentsTool = tools.get("task_agents");
		const steerTaskAgentTool = tools.get("steer_task_agent");

		(runSync as MockRunSync).mockResolvedValueOnce(makeSingleResult(0)).mockResolvedValueOnce(makeSingleResult(0));
		(getFinalOutput as MockGetFinalOutput)
			.mockReturnValueOnce("Initial summary")
			.mockReturnValueOnce("Steered summary\n\nReferences:\n- src/auth.ts");

		const firstRun = await taskAgentsTool.execute(
			"call-1",
			{ tasks: [{ id: "auth-scan", prompt: "Inspect auth" }], concurrency: 1 },
			undefined,
			undefined,
			{ cwd: "/repo" },
		);

		const steerResult = await steerTaskAgentTool.execute(
			"call-2",
			{
				runId: firstRun.details.runId,
				taskId: "auth-scan",
				instruction: "Focus on auth middleware ordering",
			},
			undefined,
			undefined,
			{ cwd: "/repo" },
		);

		expect(runSync).toHaveBeenCalledTimes(2);
		expect((runSync as MockRunSync).mock.calls[1]?.[3]).toContain("Steering update from the main planning agent");
		expect((runSync as MockRunSync).mock.calls[1]?.[3]).toContain("Focus on auth middleware ordering");
		expect(steerResult.isError).toBe(false);
		expect(steerResult.details.tasks[0]?.steeringNotes).toEqual(["Focus on auth middleware ordering"]);
		expect(steerResult.details.tasks[0]?.references).toContain("src/auth.ts");
		expect(steerResult.content[0]?.text).toContain("Steered auth-scan");
	});
});
