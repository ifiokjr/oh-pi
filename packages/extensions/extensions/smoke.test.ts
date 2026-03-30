import { describe, expect, it } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.ts";
import btwExtension from "./btw.js";
import schedulerExtension from "./scheduler.js";

describe("extensions runtime smoke tests", () => {
	it("registers scheduler commands and handles a basic tool flow", async () => {
		const harness = createExtensionHarness();
		schedulerExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);

		expect(harness.commands.has("schedule")).toBe(true);
		expect(harness.commands.has("loop")).toBe(true);
		expect(harness.tools.has("schedule_prompt")).toBe(true);

		const tool = harness.tools.get("schedule_prompt");
		const result = await tool.execute("tool-1", { action: "add", prompt: "check CI", kind: "once", duration: "30m" });
		expect(result.content[0].text).toContain("Reminder scheduled");
	});

	it("registers btw commands and fails gracefully without an active model", async () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		expect(harness.commands.has("btw")).toBe(true);
		expect(harness.commands.has("qq")).toBe(true);

		await harness.commands.get("btw").handler("what changed?", harness.ctx);
		expect(harness.notifications.some((item) => item.msg.includes("No active model selected"))).toBe(true);
	});
});
