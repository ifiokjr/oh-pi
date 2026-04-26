import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkSubagentDepth, DEFAULT_SUBAGENT_MAX_DEPTH, getSubagentDepthEnv } from "../types.js";

let savedDepth: string | undefined;
let savedMaxDepth: string | undefined;

function unsetEnv(key: keyof NodeJS.ProcessEnv): void {
	Reflect.deleteProperty(process.env, key);
}

beforeEach(() => {
	savedDepth = process.env.PI_SUBAGENT_DEPTH;
	savedMaxDepth = process.env.PI_SUBAGENT_MAX_DEPTH;
});

afterEach(() => {
	if (savedDepth === undefined) {
		unsetEnv("PI_SUBAGENT_DEPTH");
	} else {
		process.env.PI_SUBAGENT_DEPTH = savedDepth;
	}

	if (savedMaxDepth === undefined) {
		unsetEnv("PI_SUBAGENT_MAX_DEPTH");
	} else {
		process.env.PI_SUBAGENT_MAX_DEPTH = savedMaxDepth;
	}
});

describe("DEFAULT_SUBAGENT_MAX_DEPTH", () => {
	it("is 2", () => {
		expect(DEFAULT_SUBAGENT_MAX_DEPTH).toBe(2);
	});
});

describe("checkSubagentDepth", () => {
	it("does not block at depth=0 max=2", () => {
		process.env.PI_SUBAGENT_DEPTH = "0";
		process.env.PI_SUBAGENT_MAX_DEPTH = "2";
		const result = checkSubagentDepth();
		expect(result).toEqual({ blocked: false, depth: 0, maxDepth: 2 });
	});

	it("does not block at depth=1 max=2", () => {
		process.env.PI_SUBAGENT_DEPTH = "1";
		process.env.PI_SUBAGENT_MAX_DEPTH = "2";
		expect(checkSubagentDepth().blocked).toBe(false);
	});

	it("blocks at depth=2 max=2", () => {
		process.env.PI_SUBAGENT_DEPTH = "2";
		process.env.PI_SUBAGENT_MAX_DEPTH = "2";
		const result = checkSubagentDepth();
		expect(result).toEqual({ blocked: true, depth: 2, maxDepth: 2 });
	});

	it("blocks at depth=3 max=2", () => {
		process.env.PI_SUBAGENT_DEPTH = "3";
		process.env.PI_SUBAGENT_MAX_DEPTH = "2";
		expect(checkSubagentDepth().blocked).toBe(true);
	});

	it("blocks at depth=0 max=0 to disable subagents entirely", () => {
		process.env.PI_SUBAGENT_DEPTH = "0";
		process.env.PI_SUBAGENT_MAX_DEPTH = "0";
		expect(checkSubagentDepth().blocked).toBe(true);
	});

	it("defaults to depth=0 max=2 when env vars are unset", () => {
		unsetEnv("PI_SUBAGENT_DEPTH");
		unsetEnv("PI_SUBAGENT_MAX_DEPTH");
		const result = checkSubagentDepth();
		expect(result).toEqual({ blocked: false, depth: 0, maxDepth: 2 });
	});

	it("does not block when depth is invalid", () => {
		process.env.PI_SUBAGENT_DEPTH = "garbage";
		process.env.PI_SUBAGENT_MAX_DEPTH = "2";
		expect(checkSubagentDepth().blocked).toBe(false);
	});
});

describe("getSubagentDepthEnv", () => {
	it("increments from depth=0", () => {
		process.env.PI_SUBAGENT_DEPTH = "0";
		unsetEnv("PI_SUBAGENT_MAX_DEPTH");
		expect(getSubagentDepthEnv()).toEqual({
			PI_SUBAGENT_DEPTH: "1",
			PI_SUBAGENT_MAX_DEPTH: "2",
		});
	});

	it("increments from depth=1", () => {
		process.env.PI_SUBAGENT_DEPTH = "1";
		unsetEnv("PI_SUBAGENT_MAX_DEPTH");
		expect(getSubagentDepthEnv()).toEqual({
			PI_SUBAGENT_DEPTH: "2",
			PI_SUBAGENT_MAX_DEPTH: "2",
		});
	});

	it("defaults to depth=1 when env vars are unset", () => {
		unsetEnv("PI_SUBAGENT_DEPTH");
		unsetEnv("PI_SUBAGENT_MAX_DEPTH");
		expect(getSubagentDepthEnv()).toEqual({
			PI_SUBAGENT_DEPTH: "1",
			PI_SUBAGENT_MAX_DEPTH: "2",
		});
	});

	it("respects a custom PI_SUBAGENT_MAX_DEPTH", () => {
		process.env.PI_SUBAGENT_DEPTH = "0";
		process.env.PI_SUBAGENT_MAX_DEPTH = "5";
		expect(getSubagentDepthEnv()).toEqual({
			PI_SUBAGENT_DEPTH: "1",
			PI_SUBAGENT_MAX_DEPTH: "5",
		});
	});

	it("falls back to depth=1 when the parent depth is invalid", () => {
		process.env.PI_SUBAGENT_DEPTH = "not-a-number";
		unsetEnv("PI_SUBAGENT_MAX_DEPTH");
		expect(getSubagentDepthEnv()).toEqual({
			PI_SUBAGENT_DEPTH: "1",
			PI_SUBAGENT_MAX_DEPTH: "2",
		});
	});
});
