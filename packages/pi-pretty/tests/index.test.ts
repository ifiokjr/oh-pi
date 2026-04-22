import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/read.js", () => ({
	enhanceReadTool: vi.fn(),
}));
vi.mock("../src/bash.js", () => ({
	enhanceBashTool: vi.fn(),
}));
vi.mock("../src/ls.js", () => ({
	enhanceLsTool: vi.fn(),
}));
vi.mock("../src/find-grep.js", () => ({
	enhanceFindTool: vi.fn(),
	enhanceGrepTool: vi.fn(),
	enhanceMultiGrepTool: vi.fn(),
	multiGrep: vi.fn().mockResolvedValue({ ok: true, message: "found 1 match", matches: 1, results: [] }),
}));
vi.mock("../src/fff-helpers.js", () => ({
	checkHealth: vi.fn().mockResolvedValue({ ok: true, message: "healthy", indexed: true, fileCount: 42 }),
	rescan: vi.fn().mockResolvedValue({ ok: true, message: "rescan done", indexed: true }),
	multiGrep: vi.fn().mockResolvedValue({ ok: true, message: "found 1 match", matches: 1, results: [] }),
}));

const mockRegisterCommand = vi.fn();
const mockRegisterTool = vi.fn();
const mockNotify = vi.fn();

const mockExtensionAPI = {
	registerCommand: mockRegisterCommand,
	registerTool: mockRegisterTool,
};

const mockCtx = {
	hasUI: true,
	ui: {
		notify: mockNotify,
		setWidget: vi.fn(),
	},
	waitForIdle: vi.fn().mockResolvedValue(undefined),
	shutdown: vi.fn(),
	sessionManager: {
		getSessionFile: vi.fn().mockReturnValue("/tmp/session.json"),
	},
};

describe("extension entry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers fff-health command", async () => {
		const { default: extension } = await import("../index.js");
		extension(mockExtensionAPI as any);
		expect(mockRegisterCommand).toHaveBeenCalledWith("fff-health", expect.any(Object));
	});

	it("registers fff-rescan command", async () => {
		const { default: extension } = await import("../index.js");
		extension(mockExtensionAPI as any);
		expect(mockRegisterCommand).toHaveBeenCalledWith("fff-rescan", expect.any(Object));
	});

	it("registers multi-grep command", async () => {
		const { default: extension } = await import("../index.js");
		extension(mockExtensionAPI as any);
		expect(mockRegisterCommand).toHaveBeenCalledWith("multi-grep", expect.any(Object));
	});

	it("fff-health handler returns status", async () => {
		const { default: extension, __testOnlyReload: reload } = await import("../index.js");
		extension(mockExtensionAPI as any);
		const handler = mockRegisterCommand.mock.calls.find((call) => call[0] === "fff-health")?.[1].handler;
		await handler("", mockCtx as any);
		expect(mockNotify).toHaveBeenCalledWith("healthy", "info");
	});

	it("fff-health handler shows warning on degraded status", async () => {
		const { default: extension } = await import("../index.js");
		extension(mockExtensionAPI as any);
		vi.doMock("../src/fff-helpers.js", () => ({
			checkHealth: vi.fn().mockResolvedValue({ ok: false, message: "degraded", indexed: false }),
		}));
		const handler = mockRegisterCommand.mock.calls.find((call) => call[0] === "fff-health")?.[1].handler;
		await handler("", mockCtx as any);
		expect(mockNotify).toHaveBeenCalledWith("degraded", "warning");
	});

	it("fff-rescan handler returns status", async () => {
		const { default: extension } = await import("../index.js");
		extension(mockExtensionAPI as any);
		const handler = mockRegisterCommand.mock.calls.find((call) => call[0] === "fff-rescan")?.[1].handler;
		await handler("", mockCtx as any);
		expect(mockNotify).toHaveBeenCalledWith("rescan done", "info");
	});

	it("multi-grep handler shows error on failed search", async () => {
		const { default: extension } = await import("../index.js");
		extension(mockExtensionAPI as any);
		const handler = mockRegisterCommand.mock.calls.find((call) => call[0] === "multi-grep")?.[1].handler;
		vi.doMock("../src/find-grep.js", () => ({
			multiGrep: vi.fn().mockResolvedValue({ ok: false, message: "no matches", matches: 0, results: [] }),
		}));
		await handler('patterns=["foo"] glob="*.ts"', mockCtx as any);
		expect(mockNotify).toHaveBeenCalledWith("no matches", "warning");
	});
});