import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import diagnosticsExtension, { diagnosticsInternals, type PromptCompletionDiagnostics } from "../index.js";

type ThemeStub = {
	bg: (_color: string, text: string) => string;
	fg: (_color: string, text: string) => string;
	bold: (text: string) => string;
};

const theme: ThemeStub = {
	bg: (_color: string, text: string) => text,
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

function renderText(component: { render: (width: number) => string[] }, width = 200): string {
	return component.render(width).join("\n");
}

function makeCompletion(overrides: Partial<PromptCompletionDiagnostics> = {}): PromptCompletionDiagnostics {
	return {
		promptPreview: "Investigate the flaky test timeout in CI.",
		startedAt: Date.UTC(2026, 3, 16, 11, 0, 0),
		startedAtLabel: "2026-04-16 11:00:00",
		completedAt: Date.UTC(2026, 3, 16, 11, 0, 7),
		completedAtLabel: "2026-04-16 11:00:07",
		durationMs: 7_250,
		durationLabel: "7.3s",
		turnCount: 2,
		toolCount: 1,
		status: "completed",
		statusLabel: "completed",
		stopReason: "stop",
		turns: [
			{
				turnIndex: 0,
				completedAt: Date.UTC(2026, 3, 16, 11, 0, 1),
				completedAtLabel: "2026-04-16 11:00:01",
				elapsedMs: 1_250,
				elapsedLabel: "1.3s",
				toolCount: 1,
				stopReason: "toolUse",
				responsePreview: "Checking the failing tests.",
			},
			{
				turnIndex: 1,
				completedAt: Date.UTC(2026, 3, 16, 11, 0, 7),
				completedAtLabel: "2026-04-16 11:00:07",
				elapsedMs: 7_250,
				elapsedLabel: "7.3s",
				toolCount: 0,
				stopReason: "stop",
				responsePreview: "Done.",
			},
		],
		...overrides,
	};
}

describe("diagnostics extension", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-16T11:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("internals", () => {
		it("classifies stop reasons and prompt state entries", () => {
			expect(diagnosticsInternals.classifyStopReason("aborted")).toMatchObject({ status: "aborted", color: "warning" });
			expect(diagnosticsInternals.classifyStopReason("error")).toMatchObject({ status: "error", color: "error" });
			expect(diagnosticsInternals.classifyStopReason("length")).toMatchObject({ status: "completed", color: "success" });
			expect(diagnosticsInternals.classifyStopReason("toolUse")).toMatchObject({ status: "unknown", color: "muted" });
			expect(diagnosticsInternals.isPromptCompletionDiagnostics(makeCompletion())).toBe(true);
			expect(diagnosticsInternals.isPromptCompletionDiagnostics({ completedAt: "later" })).toBe(false);
			expect(diagnosticsInternals.isDiagnosticsStateEntry({ enabled: true })).toBe(true);
			expect(diagnosticsInternals.isDiagnosticsStateEntry({ enabled: "yes" })).toBe(false);
		});

		it("extracts message details and custom types from both session entry shapes", () => {
			const customMessageEntry = {
				type: "custom_message",
				customType: "pi-diagnostics:prompt",
				details: makeCompletion(),
			};
			const legacyMessageEntry = {
				type: "message",
				message: {
					role: "custom",
					customType: "pi-diagnostics:prompt",
					details: makeCompletion({ promptPreview: "Restored from legacy entry" }),
				},
			};

			expect(diagnosticsInternals.getMessageCustomType(customMessageEntry)).toBe("pi-diagnostics:prompt");
			expect(diagnosticsInternals.getMessageDetails(customMessageEntry)).toMatchObject(makeCompletion());
			expect(diagnosticsInternals.getMessageCustomType(legacyMessageEntry)).toBe("pi-diagnostics:prompt");
			expect(diagnosticsInternals.getMessageDetails(legacyMessageEntry)).toMatchObject({
				promptPreview: "Restored from legacy entry",
			});
			expect(diagnosticsInternals.getMessageCustomType({ type: "message" })).toBeUndefined();
			expect(diagnosticsInternals.getMessageDetails({ type: "message" })).toBeUndefined();
		});

		it("summarizes prompts, responses, and messages", () => {
			expect(diagnosticsInternals.summarizePrompt("  Ship it.  ", [])).toBe("Ship it.");
			expect(diagnosticsInternals.summarizePrompt(undefined, ["img"])).toBe("1 image prompt");
			expect(diagnosticsInternals.summarizePrompt(undefined, ["img1", "img2"])).toBe("2 image prompt");
			expect(diagnosticsInternals.summarizePrompt(undefined, undefined)).toBe("(empty prompt)");

			expect(diagnosticsInternals.countToolResults([{}, {}])).toBe(2);
			expect(diagnosticsInternals.countToolResults(undefined)).toBe(0);

			expect(
				diagnosticsInternals.summarizeResponsePreview([{ type: "text", text: "Visible response" }], 0, null),
			).toBe("Visible response");
			expect(diagnosticsInternals.summarizeResponsePreview([], 2, null)).toBe("Used 2 tools");
			expect(diagnosticsInternals.summarizeResponsePreview([], 0, "aborted")).toBe("stop reason: aborted");
			expect(diagnosticsInternals.summarizeResponsePreview([], 0, null)).toBe("(no visible response text)");

			expect(
				diagnosticsInternals.findLastAssistantMessage([
					{ role: "user", content: "Hi" },
					{ role: "assistant", stopReason: "stop", content: "Done" },
				]),
			).toMatchObject({ role: "assistant", stopReason: "stop" });
			expect(diagnosticsInternals.findLastAssistantMessage([{ role: "user", content: "Hi" }])).toBeNull();
			expect(diagnosticsInternals.findLastAssistantMessage(undefined)).toBeNull();

			expect(
				diagnosticsInternals.findPromptPreviewFromMessages([
					{ role: "assistant", content: "ignore" },
					{ role: "user", content: [{ type: "text", text: "User prompt" }] },
				]),
			).toBe("User prompt");
			expect(diagnosticsInternals.findPromptPreviewFromMessages([{ role: "assistant", content: "ignore" }])).toBe("(empty prompt)");
			expect(diagnosticsInternals.findPromptPreviewFromMessages(undefined)).toBe("(empty prompt)");
		});

		it("builds summaries, completions, and restored session state", () => {
			const run = {
				promptPreview: "Investigate the flaky test timeout in CI.",
				startedAt: Date.UTC(2026, 3, 16, 11, 0, 0),
				startedAtLabel: "2026-04-16 11:00:00",
				turns: makeCompletion().turns,
			};
			const completion = diagnosticsInternals.buildPromptCompletion(
				run,
				[
					{ role: "user", content: [{ type: "text", text: "Investigate the flaky test timeout in CI." }] },
					{ role: "assistant", stopReason: "error", content: [{ type: "text", text: "Failed." }] },
				],
				Date.UTC(2026, 3, 16, 11, 0, 7),
			);
			const fallbackCompletion = diagnosticsInternals.buildPromptCompletion(run, undefined, Date.UTC(2026, 3, 16, 11, 0, 8));

			expect(completion).toMatchObject({
				status: "error",
				statusLabel: "errored",
				toolCount: 1,
				turnCount: 2,
				stopReason: "error",
			});
			expect(diagnosticsInternals.buildPromptSummaryText(completion)).toContain("Prompt errored");
			expect(fallbackCompletion.stopReason).toBeNull();
			expect(diagnosticsInternals.getBranchEntries({ sessionManager: { getBranch: () => "invalid" } } as never)).toEqual([]);
			expect(
				diagnosticsInternals.restoreEnabledState([
					{ type: "custom", customType: "pi-diagnostics:state", data: { enabled: false } },
					{ type: "custom", customType: "pi-diagnostics:state", data: { enabled: true } },
				]),
			).toBe(true);
			expect(diagnosticsInternals.restoreEnabledState([{ type: "message", customType: "other" }])).toBeUndefined();
			expect(
				diagnosticsInternals.restoreLastCompletion([
					{ type: "custom_message", customType: "pi-diagnostics:prompt", details: makeCompletion() },
					{
						type: "message",
						message: {
							role: "custom",
							customType: "pi-diagnostics:prompt",
							details: makeCompletion({ promptPreview: "Most recent completion" }),
						},
					},
				]),
			).toMatchObject({ promptPreview: "Most recent completion" });
			expect(diagnosticsInternals.restoreLastCompletion([])).toBeNull();
		});

		it("renders fallback, collapsed, and expanded completion messages", () => {
			const fallback = diagnosticsInternals.renderPromptCompletionMessage({ content: "Prompt diagnostics" }, false, theme as never);
			expect(renderText(fallback)).toContain("Prompt diagnostics");

			const collapsed = diagnosticsInternals.renderPromptCompletionMessage(
				{ details: makeCompletion() },
				false,
				theme as never,
			);
			expect(renderText(collapsed)).toContain("Expand to inspect per-turn completion timestamps.");

			const expandedWithNoTurns = diagnosticsInternals.renderPromptCompletionMessage(
				{ details: makeCompletion({ turnCount: 0, toolCount: 0, turns: [] }) },
				true,
				theme as never,
			);
			expect(renderText(expandedWithNoTurns)).toContain("No assistant turns were recorded for this prompt.");

			const expanded = diagnosticsInternals.renderPromptCompletionMessage(
				{ details: makeCompletion() },
				true,
				theme as never,
			);
			const rendered = renderText(expanded);
			expect(rendered).toContain("Turn completions");
			expect(rendered).toContain("#1");
			expect(rendered).toContain("toolUse");
		});
	});

	it("registers the diagnostics command, shortcut, and message renderer", () => {
		const harness = createExtensionHarness();
		diagnosticsExtension(harness.pi as never);

		expect(harness.commands.has("diagnostics")).toBe(true);
		expect(harness.shortcuts.has("ctrl+shift+d")).toBe(true);
		expect(harness.messageRenderers.has("pi-diagnostics:prompt")).toBe(true);
		const rendered = harness.messageRenderers
			.get("pi-diagnostics:prompt")
			?.({ details: makeCompletion() }, { expanded: false }, theme);
		expect(rendered ? renderText(rendered) : "").toContain("Prompt");
	});

	it("logs prompt completion timing with per-turn timestamps and updates the widget", async () => {
		const harness = createExtensionHarness();
		const setWidget = vi.fn();
		const appendEntry = vi.fn();
		harness.ctx.ui.setWidget = setWidget;
		harness.pi.appendEntry = appendEntry;
		diagnosticsExtension(harness.pi as never);

		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		const widgetFactory = setWidget.mock.calls.at(-1)?.[1] as
			| ((
					tui: { requestRender: () => void },
					theme: ThemeStub,
			  ) => { dispose: () => void; render: (width: number) => string[] })
			| undefined;
		expect(widgetFactory).toBeTypeOf("function");

		const requestRender = vi.fn();
		const widget = widgetFactory?.({ requestRender }, theme);
		expect(widget?.render(200).join("\n")).toContain("waiting for next prompt");

		harness.emit(
			"before_agent_start",
			{ type: "before_agent_start", prompt: "Investigate the flaky test timeout in CI.", images: [] },
			harness.ctx,
		);
		expect(widget?.render(200).join("\n")).toContain("running");

		await vi.advanceTimersByTimeAsync(1_000);
		expect(requestRender).toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(250);
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
		await vi.advanceTimersByTimeAsync(5_000);

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
		await vi.advanceTimersByTimeAsync(1_000);

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
		expect(message.details.durationMs).toBe(7_250);
		expect(message.details.turnCount).toBe(2);
		expect(message.details.toolCount).toBe(1);
		expect(message.details.turns[0]?.completedAtLabel).toMatch(/2026-04-16 \d{2}:00:01/);
		expect(message.details.turns[0]?.toolCount).toBe(1);
		expect(message.details.turns[1]?.responsePreview).toContain("Done.");
		expect(widget?.render(200).join("\n")).toContain("completed");

		widget?.dispose();
		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("restores session state, handles command flows, and clears the widget when disabled", async () => {
		const harness = createExtensionHarness();
		const setWidget = vi.fn();
		harness.ctx.ui.setWidget = setWidget;
		harness.ctx.sessionManager.getBranch = () =>
			([
				{ type: "custom", customType: "pi-diagnostics:state", data: { enabled: true } },
				{ type: "custom_message", customType: "pi-diagnostics:prompt", details: makeCompletion() },
			] as any);
		harness.pi.appendEntry = vi.fn();
		diagnosticsExtension(harness.pi as never);

		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		harness.emit("session_switch", { type: "session_switch" }, harness.ctx);
		harness.emit("session_tree", { type: "session_tree" }, harness.ctx);
		harness.emit("session_fork", { type: "session_fork" }, harness.ctx);

		const command = harness.commands.get("diagnostics");
		expect(command.getArgumentCompletions("o")).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ value: "on" }),
				expect.objectContaining({ value: "off" }),
			]),
		);
		expect(command.getArgumentCompletions("zzz")).toBeNull();

		await command.handler("status", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Last completed");

		const freshHarness = createExtensionHarness();
		freshHarness.ctx.ui.setWidget = vi.fn();
		diagnosticsExtension(freshHarness.pi as never);
		freshHarness.emit("session_start", { type: "session_start" }, freshHarness.ctx);
		await freshHarness.commands.get("diagnostics")?.handler("status", freshHarness.ctx);
		expect(freshHarness.notifications.at(-1)?.msg).toContain("Running: none");
		expect(freshHarness.notifications.at(-1)?.msg).toContain("Last completion: none");

		await command.handler("off", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Diagnostics disabled");
		expect(setWidget).toHaveBeenLastCalledWith("diagnostics", undefined);
		harness.emit(
			"before_agent_start",
			{ type: "before_agent_start", prompt: "Should not start while disabled", images: [] },
			harness.ctx,
		);

		await command.handler("off", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("already disabled");

		await command.handler("on", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Diagnostics enabled");

		await command.handler("on", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("already enabled");

		await command.handler("toggle", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Diagnostics disabled");

		await harness.shortcuts.get("ctrl+shift+d")?.handler(harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("via ctrl+shift+d");
		expect(harness.pi.appendEntry).toHaveBeenCalled();
	});

	it("builds a fallback completion when agent_end arrives without an active prompt", () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.setWidget = vi.fn();
		diagnosticsExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);

		harness.emit(
			"agent_end",
			{
				type: "agent_end",
				messages: [
					{ role: "user", content: [{ type: "text", text: "Summarize the release plan." }] },
					{ role: "assistant", stopReason: "aborted", content: [] },
				],
			},
			harness.ctx,
		);

		expect((harness.messages[0] as { details: PromptCompletionDiagnostics }).details).toMatchObject({
			promptPreview: "Summarize the release plan.",
			status: "aborted",
			turnCount: 0,
		});
	});

	it("ignores non-assistant turns and stops logging after diagnostics is turned off", async () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.setWidget = vi.fn();
		diagnosticsExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);

		harness.emit(
			"before_agent_start",
			{ type: "before_agent_start", prompt: undefined, images: ["img"] },
			harness.ctx,
		);
		await harness.commands.get("diagnostics")?.handler("status", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Running: 1 image prompt");
		harness.emit(
			"turn_end",
			{
				type: "turn_end",
				message: { role: "user", content: [{ type: "text", text: "Not an assistant turn." }] },
				toolResults: [],
			},
			harness.ctx,
		);

		await harness.commands.get("diagnostics")?.handler("off", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Diagnostics disabled");

		harness.emit(
			"agent_end",
			{
				type: "agent_end",
				messages: [{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Done." }] }],
			},
			harness.ctx,
		);
		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);

		expect(harness.messages).toHaveLength(0);
	});
});
