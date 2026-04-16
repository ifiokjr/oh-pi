import { describe, expect, it } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import adaptiveRoutingExtension from "./adaptive-routing.js";
import autoUpdateExtension from "./auto-update.js";
import btwExtension from "./btw.js";
import externalEditorExtension from "./external-editor.js";
import schedulerExtension from "./scheduler.js";
import toolMetadataExtension from "./tool-metadata.js";
import usageTrackerExtension from "./usage-tracker.js";
import worktreeExtension from "./worktree.js";

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

	it("registers usage tracker commands, tool, and shortcut without crashing", () => {
		const harness = createExtensionHarness();
		usageTrackerExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);

		expect(harness.commands.has("usage")).toBe(true);
		expect(harness.commands.has("usage-toggle")).toBe(true);
		expect(harness.commands.has("usage-refresh")).toBe(true);
		expect(harness.tools.has("usage_report")).toBe(true);
		expect(harness.shortcuts.has("ctrl+u")).toBe(true);
	});

	it("registers tool metadata hooks without crashing", async () => {
		const harness = createExtensionHarness();
		toolMetadataExtension(harness.pi as never);
		const [patch] = await harness.emitAsync(
			"tool_result",
			{
				toolCallId: "tool-1",
				toolName: "read",
				input: { path: "README.md" },
				content: [{ type: "text", text: "ok" }],
				details: {},
			},
			harness.ctx,
		);
		expect(patch.details.toolMetadata).toBeDefined();
	});

	it("registers auto-update startup hook without crashing", () => {
		const harness = createExtensionHarness();
		autoUpdateExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		expect(harness.notifications.length).toBeGreaterThanOrEqual(0);
	});

	it("blocks interactive git bash commands before they can hang", async () => {
		const harness = createExtensionHarness();
		const gitGuardExtension = (await import("./git-guard.js")).default;
		gitGuardExtension(harness.pi as never);
		const results = await harness.emitAsync(
			"tool_call",
			{ toolName: "bash", input: { command: "git rebase --continue" } },
			harness.ctx,
		);
		expect(results[0]).toEqual(
			expect.objectContaining({
				block: true,
				reason: expect.stringContaining("Interactive git command blocked"),
			}),
		);
	});

	it("registers adaptive routing commands without crashing", () => {
		const harness = createExtensionHarness();
		adaptiveRoutingExtension(harness.pi as never);
		expect(harness.commands.has("route")).toBe(true);
	});

	it("registers external editor command and shortcut without crashing", () => {
		const harness = createExtensionHarness();
		externalEditorExtension(harness.pi as never);
		expect(harness.commands.has("external-editor")).toBe(true);
		expect(harness.shortcuts.has("ctrl+shift+e")).toBe(true);
	});

	it("registers worktree command without crashing", () => {
		const harness = createExtensionHarness();
		worktreeExtension(harness.pi as never);
		expect(harness.commands.has("worktree")).toBe(true);
	});
});
