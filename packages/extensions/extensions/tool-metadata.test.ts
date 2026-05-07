import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import toolMetadataExtension, {
	buildToolMetadata,
	formatDuration,
	formatTimestamp,
	formatToolMetadataText,
} from "./tool-metadata.js";

describe("tool-metadata extension", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-15T09:12:13Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("formats timestamps and durations for human-readable tool metadata", () => {
		expect(formatTimestamp(Date.UTC(2026, 3, 15, 9, 12, 13))).toMatch(/2026-04-15 \d{2}:12:13/);
		expect(formatDuration(950)).toBe("950ms");
		expect(formatDuration(2300)).toBe("2.3s");
		expect(formatDuration(65_000)).toBe("1m5s");
	});

	it("sanitizes oversized text output to avoid TUI rendering crashes", async () => {
		const harness = createExtensionHarness();
		toolMetadataExtension(harness.pi as never);

		const longLine = "x".repeat(12_000);
		const [patch] = await harness.emitAsync(
			"tool_result",
			{
				toolCallId: "tool-big",
				toolName: "bash",
				input: { command: "printf huge" },
				content: [{ type: "text", text: `${longLine}\u0000${longLine}` }],
				details: {},
			},
			harness.ctx,
		);

		expect(patch.details.outputGuard).toEqual(
			expect.objectContaining({
				truncated: true,
				maxChars: 120_000,
				maxLineChars: 2_000,
				maxLines: 2_000,
			}),
		);
		expect(patch.content[0].text).toContain("[tool output truncated for UI safety]");
		expect(patch.content[0].text).not.toContain("\u0000");
	});

	it("sanitizes oversized details payloads used by fallback renderers", async () => {
		const harness = createExtensionHarness();
		toolMetadataExtension(harness.pi as never);

		const huge = `${"y".repeat(50_000)}\u0000${"z".repeat(50_000)}`;
		const [patch] = await harness.emitAsync(
			"tool_result",
			{
				toolCallId: "tool-details",
				toolName: "bash",
				input: { command: "huge" },
				content: [{ type: "text", text: "ok" }],
				details: { stdout: huge, nested: { stderr: huge } },
			},
			harness.ctx,
		);

		expect((patch.details.stdout as string).length).toBeLessThan(130_000);
		expect(patch.details.stdout).not.toContain("\u0000");
		expect((patch.details.nested as { stderr: string }).stderr.length).toBeLessThan(130_000);
		expect(patch.details.outputGuard).toEqual(expect.objectContaining({ detailsSanitized: true }));
	});

	it("builds visible completion metadata for tool results", async () => {
		const harness = createExtensionHarness();
		harness.ctx.getContextUsage = vi
			.fn()
			.mockReturnValueOnce({
				percent: 12.5,
				tokens: 24_500,
				contextWindow: 200_000,
			})
			.mockReturnValueOnce({
				percent: 13.1,
				tokens: 26_200,
				contextWindow: 200_000,
			});
		toolMetadataExtension(harness.pi as never);

		await harness.emitAsync(
			"tool_call",
			{
				toolCallId: "tool-1",
				toolName: "bash",
				input: { command: "pnpm test" },
			},
			harness.ctx,
		);
		await vi.advanceTimersByTimeAsync(2300);

		const [patch] = await harness.emitAsync(
			"tool_result",
			{
				toolCallId: "tool-1",
				toolName: "bash",
				input: { command: "pnpm test" },
				content: [{ type: "text", text: "tests passed" }],
				details: {},
			},
			harness.ctx,
		);

		expect(patch.details.toolMetadata.durationMs).toBe(2300);
		expect(patch.details.toolMetadata.approxContextTokens).toBeGreaterThan(0);
		expect(patch.content.at(-1).text).toContain("[tool metadata] completed");
		expect(patch.content.at(-1).text).toContain("duration 2.3s");
		expect(patch.content.at(-1).text).toContain("session context 13%");
	});

	it("creates metadata even when a tool_result arrives without a matching tool_call", () => {
		const metadata = buildToolMetadata(
			"read",
			Date.UTC(2026, 3, 15, 9, 12, 13),
			Date.UTC(2026, 3, 15, 9, 12, 13),
			{ path: "README.md" },
			[{ type: "text", text: "hello" }],
			{ getContextUsage: () => undefined } as never,
		);

		expect(metadata.durationMs).toBe(0);
		expect(formatToolMetadataText(metadata)).toContain("tool context");
	});

	it("skips session context metadata when the extension ctx has gone stale", () => {
		const metadata = buildToolMetadata(
			"bash",
			Date.UTC(2026, 3, 15, 9, 12, 13),
			Date.UTC(2026, 3, 15, 9, 12, 14),
			{ command: "echo ok" },
			[{ type: "text", text: "ok" }],
			{
				getContextUsage: () => {
					throw new Error("This extension ctx is stale after session replacement or reload");
				},
			} as never,
		);

		expect(metadata.contextAtCompletion).toBeNull();
		expect(formatToolMetadataText(metadata)).not.toContain("session context");
	});
});
