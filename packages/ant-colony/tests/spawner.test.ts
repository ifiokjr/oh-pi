import { describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", () => ({
	AuthStorage: class {},
	createAgentSession: vi.fn(),
	createReadTool: vi.fn(),
	createBashTool: vi.fn(),
	createEditTool: vi.fn(),
	createWriteTool: vi.fn(),
	createGrepTool: vi.fn(),
	createFindTool: vi.fn(),
	createLsTool: vi.fn(),
	ModelRegistry: class {},
	SessionManager: { inMemory: vi.fn() },
	SettingsManager: { inMemory: vi.fn() },
	createExtensionRuntime: vi.fn(),
}));
vi.mock("@mariozechner/pi-ai", () => ({ getModel: vi.fn() }));

import { makeAntId, makePheromoneId, makeTaskId } from "../extensions/ant-colony/spawner.js";

describe("makeAntId", () => {
	it("includes caste name", () => {
		expect(makeAntId("scout")).toContain("scout");
		expect(makeAntId("worker")).toContain("worker");
	});

	it("returns unique ids", () => {
		expect(makeAntId("worker")).not.toBe(makeAntId("worker"));
	});
});

describe("makePheromoneId", () => {
	it("starts with p-", () => {
		expect(makePheromoneId()).toMatch(/^p-/);
	});

	it("returns unique ids", () => {
		expect(makePheromoneId()).not.toBe(makePheromoneId());
	});
});

describe("makeTaskId", () => {
	it("starts with t-", () => {
		expect(makeTaskId()).toMatch(/^t-/);
	});

	it("returns unique ids", () => {
		expect(makeTaskId()).not.toBe(makeTaskId());
	});
});
