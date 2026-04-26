
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import diagnosticsExtension, { diagnosticsInternals } from '../index.js';
import type { PromptCompletionDiagnostics } from '../index.js';

interface ThemeStub {
	bg: (_color: string, text: string) => string;
	fg: (_color: string, text: string) => string;
	bold: (text: string) => string;
}

const theme: ThemeStub = {
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	fg: (_color: string, text: string) => text,
};

function renderText(component: { render: (width: number) => string[] }, width = 200): string {
	return component.render(width).join("\n");
}

function makeCompletion(overrides: Partial<PromptCompletionDiagnostics> = {}): PromptCompletionDiagnostics {
	return {
		completedAt: Date.UTC(2026, 3, 16, 11, 0, 7),
		completedAtLabel: "2026-04-16 11:00:07",
		durationLabel: "7.3s",
		durationMs: 7_250,
		promptPreview: "Investigate the flaky test timeout in CI.",
		startedAt: Date.UTC(2026, 3, 16, 11, 0, 0),
		startedAtLabel: "2026-04-16 11:00:00",
		status: "completed",
		statusLabel: "completed",
		stopReason: "stop",
		toolCount: 1,
		turnCount: 2,
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
			expect(diagnosticsInternals.classifyStopReason("aborted")).toMatchObject({ color: "warning", status: "aborted" });
			expect(diagnosticsInternals.classifyStopReason("error")).toMatchObject({ color: "error", status: "error" });
			expect(diagnosticsInternals.classifyStopReason("length")).toMatchObject({
				color: "success",
				status: "completed",
			});
			expect(diagnosticsInternals.classifyStopReason("toolUse")).toMatchObject({ color: "muted", status: "unknown" });
			expect(diagnosticsInternals.isPromptCompletionDiagnostics(makeCompletion())).toBeTruthy();
			expect(diagnosticsInternals.isPromptCompletionDiagnostics({ completedAt: "later" })).toBeFalsy();
			expect(diagnosticsInternals.isDiagnosticsStateEntry({ enabled: true })).toBeTruthy();
			expect(diagnosticsInternals.isDiagnosticsStateEntry({ enabled: "yes" })).toBeFalsy();
		});

		it("extracts message details and custom types from both session entry shapes", () => {
			const customMessageEntry = {
				customType: "pi-diagnostics:prompt",
				details: makeCompletion(),
				type: "custom_message",
			};
			const legacyMessageEntry = {
				message: {
					customType: "pi-diagnostics:prompt",
					details: makeCompletion({ promptPreview: "Restored from legacy entry" }),
					role: "custom",
				},
				type: "message",
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
			expect(diagnosticsInternals.summarizePrompt()).toBe("(empty prompt)");

			expect(diagnosticsInternals.countToolResults([{}, {}])).toBe(2);
			expect(diagnosticsInternals.countToolResults()).toBe(0);

			expect(diagnosticsInternals.summarizeResponsePreview([{ text: "Visible response", type: "text" }], 0, null)).toBe(
				"Visible response",
			);
			expect(diagnosticsInternals.summarizeResponsePreview([], 2, null)).toBe("Used 2 tools");
			expect(diagnosticsInternals.summarizeResponsePreview([], 0, "aborted")).toBe("stop reason: aborted");
			expect(diagnosticsInternals.summarizeResponsePreview([], 0, null)).toBe("(no visible response text)");

			expect(
				diagnosticsInternals.findLastAssistantMessage([
					{ content: "Hi", role: "user" },
					{ content: "Done", role: "assistant", stopReason: "stop" },
				]),
			).toMatchObject({ role: "assistant", stopReason: "stop" });
			expect(diagnosticsInternals.findLastAssistantMessage([{ content: "Hi", role: "user" }])).toBeNull();
			expect(diagnosticsInternals.findLastAssistantMessage()).toBeNull();

			expect(
				diagnosticsInternals.findPromptPreviewFromMessages([
					{ content: "ignore", role: "assistant" },
					{ content: [{ type: "text", text: "User prompt" }], role: "user" },
				]),
			).toBe("User prompt");
			expect(diagnosticsInternals.findPromptPreviewFromMessages([{ content: "ignore", role: "assistant" }])).toBe(
				"(empty prompt)",
			);
			expect(diagnosticsInternals.findPromptPreviewFromMessages()).toBe("(empty prompt)");
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
					{ content: [{ type: "text", text: "Investigate the flaky test timeout in CI." }], role: "user" },
					{ content: [{ type: "text", text: "Failed." }], role: "assistant", stopReason: "error" },
				],
				Date.UTC(2026, 3, 16, 11, 0, 7),
			);
			const fallbackCompletion = diagnosticsInternals.buildPromptCompletion(
				run,
				undefined,
				Date.UTC(2026, 3, 16, 11, 0, 8),
			);

			expect(completion).toMatchObject({
				status: "error",
				statusLabel: "errored",
				stopReason: "error",
				toolCount: 1,
				turnCount: 2,
			});
			expect(diagnosticsInternals.buildPromptSummaryText(completion)).toContain("Prompt errored");
			expect(fallbackCompletion.stopReason).toBeNull();
			expect(
				diagnosticsInternals.getBranchEntries({ sessionManager: { getBranch: () => "invalid" } } as never),
			).toStrictEqual([]);
			expect(
				diagnosticsInternals.restoreEnabledState([
					{ customType: "pi-diagnostics:state", data: { enabled: false }, type: "custom" },
					{ customType: "pi-diagnostics:state", data: { enabled: true }, type: "custom" },
				]),
			).toBeTruthy();
			expect(diagnosticsInternals.restoreEnabledState([{ customType: "other", type: "message" }])).toBeUndefined();
			expect(
				diagnosticsInternals.restoreLastCompletion([
					{ customType: "pi-diagnostics:prompt", details: makeCompletion(), type: "custom_message" },
					{
						message: {
							customType: "pi-diagnostics:prompt",
							details: makeCompletion({ promptPreview: "Most recent completion" }),
							role: "custom",
						},
						type: "message",
					},
				]),
			).toMatchObject({ promptPreview: "Most recent completion" });
			expect(diagnosticsInternals.restoreLastCompletion([])).toBeNull();
		});

		it("renders fallback, collapsed, and expanded completion messages", () => {
			const fallback = diagnosticsInternals.renderPromptCompletionMessage(
				{ content: "Prompt diagnostics" },
				false,
				theme as never,
			);
			expect(renderText(fallback)).toContain("Prompt diagnostics");

			const collapsed = diagnosticsInternals.renderPromptCompletionMessage(
				{ details: makeCompletion() },
				false,
				theme as never,
			);
			expect(renderText(collapsed)).toContain("Expand to inspect per-turn completion timestamps.");

			const expandedWithNoTurns = diagnosticsInternals.renderPromptCompletionMessage(
				{ details: makeCompletion({ toolCount: 0, turnCount: 0, turns: [] }) },
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

		expect(harness.commands.has("diagnostics")).toBeTruthy();
		expect(harness.shortcuts.has("ctrl+shift+d")).toBeTruthy();
		expect(harness.messageRenderers.has("pi-diagnostics:prompt")).toBeTruthy();
		const rendered = harness.messageRenderers.get("pi-diagnostics:prompt")?.(
			{ details: makeCompletion() },
			{ expanded: false },
			theme,
		);
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

		await vi.advanceTimersByTimeAsync(1000);
		expect(requestRender).not.toHaveBeenCalled();

		harness.emit(
			"before_agent_start",
			{ images: [], prompt: "Investigate the flaky test timeout in CI.", type: "before_agent_start" },
			harness.ctx,
		);
		expect(widget?.render(200).join("\n")).toContain("running");

		await vi.advanceTimersByTimeAsync(1000);
		expect(requestRender).toHaveBeenCalledWith();

		await vi.advanceTimersByTimeAsync(250);
		harness.emit(
			"turn_end",
			{
				message: {
					content: [{ type: "text", text: "I’m checking the failing tests and CI logs now." }],
					role: "assistant",
					stopReason: "toolUse",
				},
				toolResults: [{ toolName: "read" }],
				turnIndex: 0,
				type: "turn_end",
			},
			harness.ctx,
		);
		await vi.advanceTimersByTimeAsync(5000);

		harness.emit(
			"turn_end",
			{
				message: {
					content: [{ type: "text", text: "Done. The timeout came from an unmocked fetch call." }],
					role: "assistant",
					stopReason: "stop",
				},
				toolResults: [],
				turnIndex: 1,
				type: "turn_end",
			},
			harness.ctx,
		);
		await vi.advanceTimersByTimeAsync(1000);

		harness.emit(
			"agent_end",
			{
				messages: [
					{ role: "user", content: [{ type: "text", text: "Investigate the flaky test timeout in CI." }] },
					{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Done." }] },
				],
				type: "agent_end",
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
		expect(message.details.turns[0]?.completedAtLabel).toMatch(/2026-04-16 \d{2}:00:0[12]/);
		expect(message.details.turns[0]?.toolCount).toBe(1);
		expect(message.details.turns[1]?.responsePreview).toContain("Done.");
		expect(widget?.render(200).join("\n")).toContain("completed");

		requestRender.mockClear();
		await vi.advanceTimersByTimeAsync(1000);
		expect(requestRender).not.toHaveBeenCalled();

		widget?.dispose();
		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("restores session state, handles command flows, and clears the widget when disabled", async () => {
		const harness = createExtensionHarness();
		const setWidget = vi.fn();
		harness.ctx.ui.setWidget = setWidget;
		harness.ctx.sessionManager.getBranch = () =>
			[
				{ customType: "pi-diagnostics:state", data: { enabled: true }, type: "custom" },
				{ customType: "pi-diagnostics:prompt", details: makeCompletion(), type: "custom_message" },
			] as any;
		harness.pi.appendEntry = vi.fn();
		diagnosticsExtension(harness.pi as never);

		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		harness.emit("session_switch", { type: "session_switch" }, harness.ctx);
		harness.emit("session_tree", { type: "session_tree" }, harness.ctx);
		harness.emit("session_fork", { type: "session_fork" }, harness.ctx);

		const command = harness.commands.get("diagnostics");
		expect(command.getArgumentCompletions("o")).toStrictEqual(
			expect.arrayContaining([expect.objectContaining({ value: "on" }), expect.objectContaining({ value: "off" })]),
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
		expect(setWidget).toHaveBeenLastCalledWith("diagnostics");
		harness.emit(
			"before_agent_start",
			{ images: [], prompt: "Should not start while disabled", type: "before_agent_start" },
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
		expect(harness.pi.appendEntry).toHaveBeenCalledWith();
	});

	it("builds a fallback completion when agent_end arrives without an active prompt", () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.setWidget = vi.fn();
		diagnosticsExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);

		harness.emit(
			"agent_end",
			{
				messages: [
					{ role: "user", content: [{ type: "text", text: "Summarize the release plan." }] },
					{ role: "assistant", stopReason: "aborted", content: [] },
				],
				type: "agent_end",
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

		harness.emit("before_agent_start", { images: ["img"], prompt: undefined, type: "before_agent_start" }, harness.ctx);
		await harness.commands.get("diagnostics")?.handler("status", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Running: 1 image prompt");
		harness.emit(
			"turn_end",
			{
				message: { content: [{ type: "text", text: "Not an assistant turn." }], role: "user" },
				toolResults: [],
				type: "turn_end",
			},
			harness.ctx,
		);

		await harness.commands.get("diagnostics")?.handler("off", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Diagnostics disabled");

		harness.emit(
			"agent_end",
			{
				messages: [{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Done." }] }],
				type: "agent_end",
			},
			harness.ctx,
		);
		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);

		expect(harness.messages).toHaveLength(0);
	});
});
