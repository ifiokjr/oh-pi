import {
	cleanupCursorRuntimeState,
	clearCursorRuntimeState,
	deleteActiveRun,
	deleteConversationState,
	deriveBridgeKey,
	deriveConversationKey,
	deterministicConversationId,
	getActiveRun,
	getConversationState,
	getCursorRuntimeStateSummary,
	setActiveRun,
	upsertConversationState,
} from "../runtime.js";

afterEach(() => {
	clearCursorRuntimeState();
	vi.restoreAllMocks();
});

describe("cursor runtime state", () => {
	it("derives stable conversation and bridge identifiers", () => {
		expect(deriveConversationKey(" session-1 ", "seed")).toBe("session:session-1");
		expect(deriveConversationKey(undefined, "seed text")).toMatch(/^seed:/);
		expect(deriveBridgeKey("session:session-1", "composer-2")).toBe("session:session-1:composer-2");
		expect(deterministicConversationId("session:session-1")).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	it("stores, reads, summarizes, and deletes conversation checkpoints", () => {
		const checkpoint = new Uint8Array([1, 2, 3]);
		const first = upsertConversationState("session:one", () => ({
			blobStore: new Map([["blob", new Uint8Array([9])]]),
			checkpoint,
			conversationId: "conv-1",
			lastAccessMs: 0,
		}));
		expect(first.conversationId).toBe("conv-1");
		expect(getConversationState("session:one")?.checkpoint).toStrictEqual(checkpoint);
		expect(getCursorRuntimeStateSummary()).toStrictEqual({ activeRuns: 0, checkpoints: 1 });

		deleteConversationState("session:one");
		expect(getConversationState("session:one")).toBeUndefined();
	});

	it("closes stale active runs and clears runtime state", () => {
		vi.useFakeTimers();
		const aliveConnection = {
			close: vi.fn(),
			isAlive: vi.fn(() => true),
		};
		const staleConnection = {
			close: vi.fn(),
			isAlive: vi.fn(() => false),
		};

		setActiveRun("alive", {
			blobStore: new Map(),
			connection: aliveConnection as never,
			lastAccessMs: Date.now(),
			mcpTools: [],
			pendingExecs: [],
		});
		setActiveRun("stale", {
			blobStore: new Map(),
			connection: staleConnection as never,
			lastAccessMs: Date.now() - 10 * 60 * 1000,
			mcpTools: [],
			pendingExecs: [],
		});

		cleanupCursorRuntimeState();
		expect(getActiveRun("alive")).toBeDefined();
		expect(getActiveRun("stale")).toBeUndefined();
		expect(staleConnection.close).toHaveBeenCalledOnce();

		deleteActiveRun("alive");
		expect(aliveConnection.close).toHaveBeenCalledOnce();
		expect(getActiveRun("alive")).toBeUndefined();

		setActiveRun("alive-2", {
			blobStore: new Map(),
			connection: aliveConnection as never,
			lastAccessMs: Date.now(),
			mcpTools: [],
			pendingExecs: [],
		});
		upsertConversationState("session:two", () => ({
			blobStore: new Map(),
			conversationId: "conv-2",
			lastAccessMs: 0,
		}));
		clearCursorRuntimeState();
		expect(aliveConnection.close).toHaveBeenCalledTimes(2);
		expect(getCursorRuntimeStateSummary()).toStrictEqual({ activeRuns: 0, checkpoints: 0 });
	});
});
