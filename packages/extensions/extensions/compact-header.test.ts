import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";

const { readFileSyncMock, getAgentDirMock } = vi.hoisted(() => ({
	readFileSyncMock: vi.fn(),
	getAgentDirMock: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		readFileSync: readFileSyncMock,
	};
});

vi.mock("@mariozechner/pi-coding-agent", async () => {
	const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>("@mariozechner/pi-coding-agent");
	return {
		...actual,
		getAgentDir: getAgentDirMock,
	};
});

import compactHeaderExtension from "./compact-header.js";

describe("compact-header plain-icons bootstrap", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		readFileSyncMock.mockReset();
		getAgentDirMock.mockReset();
		getAgentDirMock.mockReturnValue("/mock-home/.pi/agent");
		process.env.OH_PI_PLAIN_ICONS = "";
	});

	afterEach(() => {
		vi.useRealTimers();
		process.env.OH_PI_PLAIN_ICONS = "";
	});

	it("defers settings.json plain-icons reads until after the startup window", async () => {
		readFileSyncMock.mockReturnValue('{"plainIcons": true}');
		const harness = createExtensionHarness();
		(harness.ctx.ui as { setHeader: ReturnType<typeof vi.fn> }).setHeader = vi.fn();

		compactHeaderExtension(harness.pi as never);
		expect(readFileSyncMock).not.toHaveBeenCalled();

		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		expect(readFileSyncMock).not.toHaveBeenCalled();
		expect(process.env.OH_PI_PLAIN_ICONS).toBe("");

		await vi.advanceTimersByTimeAsync(250);
		expect(readFileSyncMock).toHaveBeenCalled();
		expect(process.env.OH_PI_PLAIN_ICONS).toBe("1");
	});

	it("cancels deferred plain-icons sync on session_shutdown", async () => {
		readFileSyncMock.mockReturnValue('{"plainIcons": true}');
		const harness = createExtensionHarness();
		(harness.ctx.ui as { setHeader: ReturnType<typeof vi.fn> }).setHeader = vi.fn();

		compactHeaderExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
		await vi.advanceTimersByTimeAsync(250);

		expect(readFileSyncMock).not.toHaveBeenCalled();
		expect(process.env.OH_PI_PLAIN_ICONS).toBe("");
	});

	it("still honors the --plain-icons flag immediately", () => {
		const harness = createExtensionHarness();
		harness.pi.getFlag = vi.fn((name: string) => (name === "plain-icons" ? true : undefined));
		(harness.ctx.ui as { setHeader: ReturnType<typeof vi.fn> }).setHeader = vi.fn();

		compactHeaderExtension(harness.pi as never);
		expect(process.env.OH_PI_PLAIN_ICONS).toBe("1");
		expect(readFileSyncMock).not.toHaveBeenCalled();
	});
});
