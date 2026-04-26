import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import planExtension from "../index.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "oh-pi-plan-index-"));
	tempDirs.push(tempDir);
	return tempDir;
}

afterEach(async () => {
	while (tempDirs.length > 0) {
		const tempDir = tempDirs.pop();
		if (!tempDir) {
			continue;
		}
		await rm(tempDir, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

describe("plan extension", () => {
	it("writes plans only while plan mode is active", async () => {
		const harness = createExtensionHarness();
		planExtension(harness.pi as never);
		const setPlan = harness.tools.get("set_plan");

		const inactive = await setPlan.execute(
			"tool-1",
			{ plan: "# New plan" },
			new AbortController().signal,
			() => {},
			harness.ctx,
		);
		expect(inactive.isError).toBe(true);
		expect(inactive.content).toEqual([{ type: "text", text: "set_plan is only available while plan mode is active." }]);
	});

	it("rejects empty plans and writes the canonical plan file when active", async () => {
		const harness = createExtensionHarness();
		const tempDir = await createTempDir();
		const planFilePath = path.join(tempDir, "session.plan.md");
		harness.ctx.ui.setWidget = vi.fn();
		harness.ctx.sessionManager.getEntries = () => [
			{
				type: "custom",
				customType: "pi-plan:state",
				data: {
					version: 1,
					active: true,
					originLeafId: "leaf-1",
					planFilePath,
					lastPlanLeafId: null,
				},
			},
		];

		planExtension(harness.pi as never);
		await harness.emitAsync("session_switch", { type: "session_switch" }, harness.ctx);
		const setPlan = harness.tools.get("set_plan");

		const empty = await setPlan.execute("tool-2", { plan: "   " }, new AbortController().signal, () => {}, harness.ctx);
		expect(empty.isError).toBe(true);
		expect(empty.content).toEqual([{ type: "text", text: "set_plan requires non-empty plan text." }]);

		const result = await setPlan.execute(
			"tool-3",
			{ plan: "# Canonical Plan\n\n- verify behavior\n- add coverage" },
			new AbortController().signal,
			() => {},
			harness.ctx,
		);
		expect(result.content).toEqual([{ type: "text", text: "Plan written." }]);
		expect(result.details).toEqual({
			plan: "# Canonical Plan\n\n- verify behavior\n- add coverage",
		});
		expect(await readFile(planFilePath, "utf8")).toBe("# Canonical Plan\n\n- verify behavior\n- add coverage\n");
		expect(harness.ctx.ui.setWidget).toHaveBeenCalledWith(
			"pi-plan-banner",
			expect.any(Function),
			expect.objectContaining({ placement: "aboveEditor" }),
		);
	});

	it("injects the plan prompt before agent start when plan mode is active", async () => {
		const harness = createExtensionHarness();
		harness.ctx.sessionManager.getEntries = () => [
			{
				type: "custom",
				customType: "pi-plan:state",
				data: {
					version: 1,
					active: true,
					originLeafId: "leaf-1",
					planFilePath: "/tmp/session.plan.md",
					lastPlanLeafId: null,
				},
			},
		];

		planExtension(harness.pi as never);
		await harness.emitAsync("session_switch", { type: "session_switch" }, harness.ctx);
		const [entry] = await harness.emitAsync("before_agent_start");

		expect(entry).toEqual({
			message: expect.objectContaining({
				customType: "pi-plan:context",
				content: expect.stringContaining("set_plan"),
				display: false,
			}),
		});
	});
});
