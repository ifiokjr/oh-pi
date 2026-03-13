import { describe, expect, test } from "vitest";
import { createPlanModeStateManager, getLatestState } from "../state";

describe("getLatestState", () => {
	test("returns inactive state when no persisted state exists", () => {
		const ctx = {
			sessionManager: {
				getEntries: () => [],
				getBranch: () => [],
			},
		} as any;

		const state = getLatestState(ctx);
		expect(state.active).toBe(false);
		expect(state.version).toBe(1);
	});

	test("prefers latest session state even when current branch has stale active state", () => {
		const ctx = {
			sessionManager: {
				getEntries: () => [
					{
						type: "custom",
						customType: "pi-plan:state",
						data: { version: 1, active: true, planFilePath: "/tmp/old.plan.md", lastPlanLeafId: "leaf-old" },
					},
					{
						type: "custom",
						customType: "pi-plan:state",
						data: { version: 1, active: false, planFilePath: "/tmp/new.plan.md", lastPlanLeafId: "leaf-new" },
					},
				],
				getBranch: () => [
					{
						type: "custom",
						customType: "pi-plan:state",
						data: { version: 1, active: true, planFilePath: "/tmp/old.plan.md" },
					},
				],
			},
		} as any;

		const state = getLatestState(ctx);
		expect(state.active).toBe(false);
		expect(state.planFilePath).toBe("/tmp/new.plan.md");
		expect(state.lastPlanLeafId).toBe("leaf-new");
	});
});

describe("createPlanModeStateManager tool visibility", () => {
	function createContext(entries: any[] = []) {
		return {
			hasUI: false,
			sessionManager: {
				getEntries: () => entries,
				getSessionFile: () => undefined,
				getSessionDir: () => "/tmp",
				getSessionId: () => "session-1",
			},
		} as any;
	}

	test("adds plan mode tools when plan mode starts", () => {
		let activeTools = ["read", "bash", "edit", "write"];
		const setActiveToolsCalls: string[][] = [];

		const manager = createPlanModeStateManager({
			appendEntry: () => {},
			getActiveTools: () => activeTools,
			setActiveTools: (nextTools: string[]) => {
				setActiveToolsCalls.push(nextTools);
				activeTools = nextTools;
			},
		} as any);

		manager.startPlanMode(createContext(), {
			planFilePath: "/tmp/session.plan.md",
		});

		expect(setActiveToolsCalls).toEqual([
			["read", "bash", "edit", "write", "task_agents", "steer_task_agent", "request_user_input", "set_plan"],
		]);
	});

	test("removes plan mode tools when refreshed state is inactive", () => {
		let activeTools = ["read", "bash", "set_plan", "task_agents", "steer_task_agent", "request_user_input"];
		const setActiveToolsCalls: string[][] = [];

		const manager = createPlanModeStateManager({
			appendEntry: () => {},
			getActiveTools: () => activeTools,
			setActiveTools: (nextTools: string[]) => {
				setActiveToolsCalls.push(nextTools);
				activeTools = nextTools;
			},
		} as any);

		manager.refresh(
			createContext([
				{
					type: "custom",
					customType: "pi-plan:state",
					data: { version: 1, active: false, planFilePath: "/tmp/session.plan.md" },
				},
			]),
		);

		expect(setActiveToolsCalls).toEqual([["read", "bash"]]);
	});
});
