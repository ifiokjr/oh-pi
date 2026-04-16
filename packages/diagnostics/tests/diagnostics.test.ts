import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import diagnosticsExtension, { type PromptCompletionDiagnostics } from "../index.js";

describe("diagnostics extension", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-16T11:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("registers the diagnostics command, shortcut, and message renderer", () => {
		const harness = createExtensionHarness();
		diagnosticsExtension(harness.pi as never);

		expect(harness.commands.has("diagnostics")).toBe(true);
		expect(harness.shortcuts.has("ctrl+shift+d")).toBe(true);
		expect(harness.messageRenderers.has("pi-diagnostics:prompt")).toBe(true);
	});

	it("logs prompt completion timing with per-turn timestamps", async () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.setWidget = vi.fn();
		diagnosticsExtension(harness.pi as never);

		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		harness.emit(
			"before_agent_start",
			{ type: "before_agent_start", prompt: "Investigate the flaky test timeout in CI.", images: [] },
			harness.ctx,
		);
		await vi.advanceTimersByTimeAsync(1250);

		harness.emit(
			"turn_end",
			{
				type: "turn_end",
				turnIndex: 0,
				message: {
					role: "assistant",
					stopReason: "toolUse",
					content: [{ type: "text", text: "I’m checking the failing tests and CI logs now." }],
				},
				toolResults: [{ toolName: "read" }],
			},
			harness.ctx,
		);
		await vi.advanceTimersByTimeAsync(5000);

		harness.emit(
			"turn_end",
			{
				type: "turn_end",
				turnIndex: 1,
				message: {
					role: "assistant",
					stopReason: "stop",
					content: [{ type: "text", text: "Done. The timeout came from an unmocked fetch call." }],
				},
				toolResults: [],
			},
			harness.ctx,
		);
		await vi.advanceTimersByTimeAsync(1000);

		harness.emit(
			"agent_end",
			{
				type: "agent_end",
				messages: [
					{ role: "user", content: [{ type: "text", text: "Investigate the flaky test timeout in CI." }] },
					{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Done." }] },
				],
			},
			harness.ctx,
		);

		expect(harness.messages).toHaveLength(1);
		const message = harness.messages[0] as {
			customType: string;
			details: PromptCompletionDiagnostics;
			content: string;
		};
		expect(message.customType).toBe("pi-diagnostics:prompt");
		expect(message.content).toContain("Prompt completed");
		expect(message.content).toContain("duration 7.3s");
		expect(message.details.promptPreview).toContain("Investigate the flaky test timeout");
		expect(message.details.durationMs).toBe(7250);
		expect(message.details.turnCount).toBe(2);
		expect(message.details.toolCount).toBe(1);
		expect(message.details.turns[0]?.completedAtLabel).toMatch(/2026-04-16 \d{2}:00:01/);
		expect(message.details.turns[0]?.toolCount).toBe(1);
		expect(message.details.turns[1]?.responsePreview).toContain("Done.");
	});

	it("stops logging after diagnostics is turned off", async () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.setWidget = vi.fn();
		diagnosticsExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);

		await harness.commands.get("diagnostics")?.handler("off", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Diagnostics disabled");

		harness.emit(
			"before_agent_start",
			{ type: "before_agent_start", prompt: "Summarize the release plan.", images: [] },
			harness.ctx,
		);
		await vi.advanceTimersByTimeAsync(1200);
		harness.emit(
			"agent_end",
			{
				type: "agent_end",
				messages: [{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Done." }] }],
			},
			harness.ctx,
		);

		expect(harness.messages).toHaveLength(0);
	});
});
