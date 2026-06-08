import { describe, expect, it } from "vitest";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import autoSessionNameExtension from "./auto-session-name.js";

describe("auto-session-name extension", () => {
	it("names a new session from the first user message", async () => {
		const harness = createExtensionHarness();
		autoSessionNameExtension(harness.pi as never);

		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		await harness.emitAsync(
			"agent_end",
			{
				type: "agent_end",
				messages: [
					{
						role: "user",
						content: "Refactor scheduler startup ownership checks and notifications",
					},
				],
			},
			harness.ctx,
		);

		expect(harness.sessionName).toContain("Refactor scheduler startup ownership checks");
	});

	it("refreshes the session name when focus shifts significantly", async () => {
		const harness = createExtensionHarness();
		autoSessionNameExtension(harness.pi as never);

		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		await harness.emitAsync(
			"agent_end",
			{
				type: "agent_end",
				messages: [
					{
						role: "user",
						content: "Investigate scheduler ownership handling",
					},
				],
			},
			harness.ctx,
		);

		await harness.emitAsync(
			"agent_end",
			{
				type: "agent_end",
				messages: [
					{ role: "user", content: "Investigate scheduler ownership handling" },
					{
						role: "user",
						content: "Implement auto-continue after compaction and improve shutdown cleanup",
					},
				],
			},
			harness.ctx,
		);

		expect(harness.sessionName).toContain("Implement auto-continue after compaction");
	});

	it("stops auto renaming after the user sets a custom session name", async () => {
		const harness = createExtensionHarness();
		autoSessionNameExtension(harness.pi as never);

		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		await harness.emitAsync(
			"agent_end",
			{
				type: "agent_end",
				messages: [
					{
						role: "user",
						content: "Investigate scheduler ownership handling",
					},
				],
			},
			harness.ctx,
		);

		harness.pi.setSessionName("My locked custom name");

		await harness.emitAsync(
			"agent_end",
			{
				type: "agent_end",
				messages: [
					{ role: "user", content: "Investigate scheduler ownership handling" },
					{
						role: "user",
						content: "Implement auto-continue after compaction and improve shutdown cleanup",
					},
				],
			},
			harness.ctx,
		);

		expect(harness.sessionName).toBe("My locked custom name");
	});

	it("does not auto-name after the user sets a custom session name before the first rename", async () => {
		const harness = createExtensionHarness();
		autoSessionNameExtension(harness.pi as never);

		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		harness.pi.setSessionName("Pinned session name");

		await harness.emitAsync(
			"agent_end",
			{
				type: "agent_end",
				messages: [
					{
						role: "user",
						content: "Refactor scheduler startup ownership checks and notifications",
					},
				],
			},
			harness.ctx,
		);

		expect(harness.sessionName).toBe("Pinned session name");
	});

	it("queues a continue message when compaction finishes", () => {
		const harness = createExtensionHarness();
		autoSessionNameExtension(harness.pi as never);

		harness.emit("compact", { type: "compact" }, harness.ctx);
		expect(harness.userMessages.at(-1)).toBe("continue");
	});

	it("does not emit messages on session switch or shutdown", () => {
		const harness = createExtensionHarness();
		autoSessionNameExtension(harness.pi as never);

		harness.emit("session_switch", { type: "session_switch" }, harness.ctx);
		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);

		expect(harness.messages).toEqual([]);
	});
});
