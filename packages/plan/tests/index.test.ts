import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
		await rm(tempDir, { force: true, recursive: true });
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
		expect(inactive.isError).toBeTruthy();
		expect(inactive.content).toStrictEqual([
			{ text: "set_plan is only available while plan mode is active.", type: "text" },
		]);
	});

	it("rejects empty plans and writes the canonical plan file when active", async () => {
		const harness = createExtensionHarness();
		const tempDir = await createTempDir();
		const planFilePath = path.join(tempDir, "session.plan.md");
		harness.ctx.ui.setWidget = vi.fn();
		harness.ctx.sessionManager.getEntries = () => [
			{
				customType: "pi-plan:state",
				data: {
					active: true,
					lastPlanLeafId: null,
					originLeafId: "leaf-1",
					planFilePath,
					version: 1,
				},
				type: "custom",
			},
		];

		planExtension(harness.pi as never);
		await harness.emitAsync("session_switch", { type: "session_switch" }, harness.ctx);
		const setPlan = harness.tools.get("set_plan");

		const empty = await setPlan.execute("tool-2", { plan: "   " }, new AbortController().signal, () => {}, harness.ctx);
		expect(empty.isError).toBeTruthy();
		expect(empty.content).toStrictEqual([{ text: "set_plan requires non-empty plan text.", type: "text" }]);

		const result = await setPlan.execute(
			"tool-3",
			{ plan: "# Canonical Plan\n\n- verify behavior\n- add coverage" },
			new AbortController().signal,
			() => {},
			harness.ctx,
		);
		expect(result.content).toStrictEqual([{ text: "Plan written.", type: "text" }]);
		expect(result.details).toStrictEqual({
			plan: "# Canonical Plan\n\n- verify behavior\n- add coverage",
		});
		await expect(readFile(planFilePath, "utf8")).resolves.toBe(
			"# Canonical Plan\n\n- verify behavior\n- add coverage\n",
		);
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
				customType: "pi-plan:state",
				data: {
					active: true,
					lastPlanLeafId: null,
					originLeafId: "leaf-1",
					planFilePath: "/tmp/session.plan.md",
					version: 1,
				},
				type: "custom",
			},
		];

		planExtension(harness.pi as never);
		await harness.emitAsync("session_switch", { type: "session_switch" }, harness.ctx);
		const [entry] = await harness.emitAsync("before_agent_start");

		expect(entry).toStrictEqual({
			message: expect.objectContaining({
				content: expect.stringContaining("set_plan"),
				customType: "pi-plan:context",
				display: false,
			}),
		});
	});
});
