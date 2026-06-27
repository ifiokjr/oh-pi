import { describe, expect, it, vi } from "vitest";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import goalExtension from "../index.js";

function createGoalHarness() {
	const harness = createExtensionHarness();
	harness.ctx.ui.theme = {
		fg: (_key: string, text: string) => text,
	} as never;
	return harness;
}

describe("goal extension registration", () => {
	it("registers the /goal command and goal tools", () => {
		const harness = createGoalHarness();
		goalExtension(harness.pi);

		expect(Array.from(harness.commands.keys()).sort()).toEqual(["goal"]);
		expect(Array.from(harness.tools.keys()).sort()).toEqual(["create_goal", "get_goal", "update_goal"]);
	});
});

describe("/goal command", () => {
	it("creates an active goal and persists a set entry", async () => {
		const harness = createGoalHarness();
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		goalExtension(harness.pi);

		await harness.commands.get("goal").handler("Ship the goal extension package", harness.ctx);

		expect(appendEntry).toHaveBeenCalledWith(
			"goal",
			expect.objectContaining({
				action: "set",
				goal: expect.objectContaining({
					objective: "Ship the goal extension package",
					status: "active",
				}),
			}),
		);
		expect(harness.statusMap.get("goal")).toEqual(expect.any(String));
	});

	it("shows a usage message when called with no args and no goal", async () => {
		const harness = createGoalHarness();
		goalExtension(harness.pi);

		await harness.commands.get("goal").handler("", harness.ctx);

		expect(harness.messages.some((m) => m.customType === "goal-ui")).toBe(true);
	});

	it("clears an existing goal", async () => {
		const harness = createGoalHarness();
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		goalExtension(harness.pi);

		await harness.commands.get("goal").handler("An objective", harness.ctx);
		await harness.commands.get("goal").handler("clear", harness.ctx);

		const clearCalls = appendEntry.mock.calls.filter((c) => c[1]?.action === "clear");
		expect(clearCalls).toHaveLength(1);
		expect(clearCalls[0][1].goal).toBeNull();
	});
});

describe("goal tools", () => {
	it("get_goal returns null before any goal is set", async () => {
		const harness = createGoalHarness();
		goalExtension(harness.pi);
		const getGoal = harness.tools.get("get_goal");

		const result = await getGoal.execute("call-1", {}, new AbortController().signal, () => {}, harness.ctx);

		const parsed = JSON.parse(result.content[0].text);
		expect(parsed.goal).toBeNull();
	});

	it("create_goal sets a goal and get_goal reflects it", async () => {
		const harness = createGoalHarness();
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		goalExtension(harness.pi);

		const createGoal = harness.tools.get("create_goal");
		await createGoal.execute(
			"call-1",
			{ objective: "Land the release", token_budget: 50_000 },
			new AbortController().signal,
			() => {},
			harness.ctx,
		);

		const getGoal = harness.tools.get("get_goal");
		const result = await getGoal.execute("call-2", {}, new AbortController().signal, () => {}, harness.ctx);
		const parsed = JSON.parse(result.content[0].text);

		expect(parsed.goal.objective).toBe("Land the release");
		expect(parsed.goal.status).toBe("active");
		expect(parsed.goal.tokenBudget).toBe(50_000);
		expect(parsed.remainingTokens).toBe(50_000);
	});

	it("create_goal rejects when an unfinished goal already exists", async () => {
		const harness = createGoalHarness();
		goalExtension(harness.pi);
		const createGoal = harness.tools.get("create_goal");

		await createGoal.execute(
			"call-1",
			{ objective: "First goal" },
			new AbortController().signal,
			() => {},
			harness.ctx,
		);

		await expect(
			createGoal.execute("call-2", { objective: "Second goal" }, new AbortController().signal, () => {}, harness.ctx),
		).rejects.toThrow(/unfinished goal/);
	});

	it("update_goal marks the active goal complete and reports budget", async () => {
		const harness = createGoalHarness();
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		goalExtension(harness.pi);

		const createGoal = harness.tools.get("create_goal");
		await createGoal.execute(
			"call-1",
			{ objective: "Finish work", token_budget: 10_000 },
			new AbortController().signal,
			() => {},
			harness.ctx,
		);

		const updateGoal = harness.tools.get("update_goal");
		const result = await updateGoal.execute(
			"call-2",
			{ status: "complete" },
			new AbortController().signal,
			() => {},
			harness.ctx,
		);
		const parsed = JSON.parse(result.content[0].text);

		expect(parsed.goal.status).toBe("complete");
		expect(parsed.completionBudgetReport).toContain("tokens used");
	});

	it("update_goal rejects unknown statuses", async () => {
		const harness = createGoalHarness();
		goalExtension(harness.pi);
		const createGoal = harness.tools.get("create_goal");
		await createGoal.execute("call-1", { objective: "Anything" }, new AbortController().signal, () => {}, harness.ctx);

		const updateGoal = harness.tools.get("update_goal");
		await expect(
			updateGoal.execute("call-2", { status: "paused" }, new AbortController().signal, () => {}, harness.ctx),
		).rejects.toThrow(/complete or blocked/);
	});
});
