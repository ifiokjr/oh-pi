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
				messages: [{ role: "user", content: "Refactor scheduler startup ownership checks and notifications" }],
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
				messages: [{ role: "user", content: "Investigate scheduler ownership handling" }],
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
						content: "Implement auto-continue after compaction and improve resume hints for shutdown",
					},
				],
			},
			harness.ctx,
		);

		expect(harness.sessionName).toContain("Implement auto-continue after compaction");
	});

	it("queues a continue message when compaction finishes", () => {
		const harness = createExtensionHarness();
		autoSessionNameExtension(harness.pi as never);

		harness.emit("compact", { type: "compact" }, harness.ctx);
		expect(harness.userMessages.at(-1)).toBe("continue");
	});

	it("emits resume hints on session switch and shutdown", () => {
		const harness = createExtensionHarness();
		harness.ctx.sessionManager.getSessionFile = () => "/tmp/sessions/test-session.jsonl";
		autoSessionNameExtension(harness.pi as never);

		harness.emit("session_switch", { type: "session_switch" }, harness.ctx);
		expect(harness.messages.at(-1)?.content).toContain("Session switched");
		expect(harness.messages.at(-1)?.content).toContain("pi --session test-session");
		expect(harness.messages.at(-1)?.content).toContain("pi resume test-session");

		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
		expect(harness.messages.at(-1)?.content).toContain("Session saved");
		expect(harness.messages.at(-1)?.content).toContain("pi --session test-session");
		expect(harness.messages.at(-1)?.content).toContain("pi resume test-session");
	});
});
