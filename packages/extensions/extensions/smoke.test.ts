
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
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

		expect(harness.commands.has("schedule")).toBeTruthy();
		expect(harness.commands.has("schedule:tui")).toBeTruthy();
		expect(harness.commands.has("loop")).toBeTruthy();
		expect(harness.tools.has("schedule_prompt")).toBeTruthy();

		const tool = harness.tools.get("schedule_prompt");
		const result = await tool.execute("tool-1", { action: "add", duration: "30m", kind: "once", prompt: "check CI" });
		expect(result.content[0].text).toContain("Reminder scheduled");
	});

	it("registers btw commands and fails gracefully without an active model", async () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		expect(harness.commands.has("btw")).toBeTruthy();
		expect(harness.commands.has("qq")).toBeTruthy();

		await harness.commands.get("btw").handler("what changed?", harness.ctx);
		expect(harness.notifications.some((item) => item.msg.includes("No active model selected"))).toBeTruthy();
	});

	it("registers usage tracker commands, tool, and shortcut without crashing", () => {
		const harness = createExtensionHarness();
		usageTrackerExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);

		expect(harness.commands.has("usage")).toBeTruthy();
		expect(harness.commands.has("usage-toggle")).toBeTruthy();
		expect(harness.commands.has("usage-refresh")).toBeTruthy();
		expect(harness.tools.has("usage_report")).toBeTruthy();
		expect(harness.shortcuts.has("ctrl+shift+u")).toBeTruthy();
	});

	it("registers tool metadata hooks without crashing", async () => {
		const harness = createExtensionHarness();
		toolMetadataExtension(harness.pi as never);
		const [patch] = await harness.emitAsync(
			"tool_result",
			{
				content: [{ type: "text", text: "ok" }],
				details: {},
				input: { path: "README.md" },
				toolCallId: "tool-1",
				toolName: "read",
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
			{ input: { command: "git rebase --continue" }, toolName: "bash" },
			harness.ctx,
		);
		expect(results[0]).toStrictEqual(
			expect.objectContaining({
				block: true,
				reason: expect.stringContaining("Interactive git command blocked"),
			}),
		);
	});

	it("registers external editor command and shortcut without crashing", () => {
		const harness = createExtensionHarness();
		externalEditorExtension(harness.pi as never);
		expect(harness.commands.has("external-editor")).toBeTruthy();
		expect(harness.shortcuts.has("ctrl+shift+e")).toBeTruthy();
	});

	it("registers worktree command without crashing", () => {
		const harness = createExtensionHarness();
		worktreeExtension(harness.pi as never);
		expect(harness.commands.has("worktree")).toBeTruthy();
	});
});
