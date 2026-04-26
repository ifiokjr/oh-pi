vi.mock<typeof import("../src/read.js")>(import("../src/read.js"), () => ({
	enhanceReadTool: vi.fn(),
}));
vi.mock<typeof import("../src/bash.js")>(import("../src/bash.js"), () => ({
	enhanceBashTool: vi.fn(),
}));
vi.mock<typeof import("../src/ls.js")>(import("../src/ls.js"), () => ({
	enhanceLsTool: vi.fn(),
}));
vi.mock<typeof import("../src/find-grep.js")>(import("../src/find-grep.js"), () => ({
	enhanceFindTool: vi.fn(),
	enhanceGrepTool: vi.fn(),
	enhanceMultiGrepTool: vi.fn(),
	multiGrep: vi.fn().mockResolvedValue({ matches: 1, message: "found 1 match", ok: true, results: [] }),
}));
vi.mock<typeof import("../src/fff-helpers.js")>(import("../src/fff-helpers.js"), () => ({
	checkHealth: vi.fn().mockResolvedValue({ ok: true, message: "healthy", indexed: true, fileCount: 42 }),
	multiGrep: vi.fn().mockResolvedValue({ ok: true, message: "found 1 match", matches: 1, results: [] }),
	rescan: vi.fn().mockResolvedValue({ ok: true, message: "rescan done", indexed: true }),
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
	sessionManager: {
		getSessionFile: vi.fn().mockReturnValue("/tmp/session.json"),
	},
	shutdown: vi.fn(),
	ui: {
		notify: mockNotify,
		setWidget: vi.fn(),
	},
	waitForIdle: vi.fn().mockResolvedValue(undefined),
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

	it("multi-grep handler parses patterns", async () => {
		const { default: extension } = await import("../index.js");
		extension(mockExtensionAPI as any);
		const handler = mockRegisterCommand.mock.calls.find((call) => call[0] === "multi-grep")?.[1].handler;
		await handler('patterns=["foo","bar"] glob="*.ts"', mockCtx as any);
		expect(mockNotify).toHaveBeenCalledWith();
	});

	it("multi-grep handler with missing patterns shows warning", async () => {
		const { default: extension } = await import("../index.js");
		extension(mockExtensionAPI as any);
		const handler = mockRegisterCommand.mock.calls.find((call) => call[0] === "multi-grep")?.[1].handler;
		await handler('glob="*.ts"', mockCtx as any);
		expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "warning");
	});
});
