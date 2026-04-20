import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_MAX_CONCURRENCY,
	DEFAULT_MAX_PARALLEL,
	resolveSubagentLimits,
} from "../types.js";

const tempDirs: string[] = [];
let savedEnv: { parallel?: string; concurrency?: string } = {};
let savedHome: string;

function createTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

beforeEach(() => {
	savedEnv.parallel = process.env.PI_SUBAGENT_MAX_PARALLEL;
	savedEnv.concurrency = process.env.PI_SUBAGENT_MAX_CONCURRENCY;
	savedHome = process.env.HOME!;
	delete process.env.PI_SUBAGENT_MAX_PARALLEL;
	delete process.env.PI_SUBAGENT_MAX_CONCURRENCY;
	// Isolate from real ~/.pi/agent/settings.json
	process.env.HOME = "/nonexistent-home-test";
});

afterEach(() => {
	if (savedEnv.parallel !== undefined) process.env.PI_SUBAGENT_MAX_PARALLEL = savedEnv.parallel;
	else delete process.env.PI_SUBAGENT_MAX_PARALLEL;
	if (savedEnv.concurrency !== undefined) process.env.PI_SUBAGENT_MAX_CONCURRENCY = savedEnv.concurrency;
	else delete process.env.PI_SUBAGENT_MAX_CONCURRENCY;
	process.env.HOME = savedHome;
	for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
	tempDirs.length = 0;
});

describe("resolveSubagentLimits", () => {
	it("returns defaults when no config exists", () => {
		const cwd = createTempDir("limits-none-");
		const limits = resolveSubagentLimits(cwd);
		expect(limits.maxParallel).toBe(DEFAULT_MAX_PARALLEL);
		expect(limits.maxConcurrency).toBe(DEFAULT_MAX_CONCURRENCY);
	});

	it("reads maxParallel from project .pi/settings.json", () => {
		const cwd = createTempDir("limits-project-");
		fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		fs.writeFileSync(
			path.join(cwd, ".pi", "settings.json"),
			JSON.stringify({ subagent: { maxParallel: 10, maxConcurrency: 5 } }),
		);
		const limits = resolveSubagentLimits(cwd);
		expect(limits.maxParallel).toBe(10);
		expect(limits.maxConcurrency).toBe(5);
	});

	it("reads partial config (only maxParallel set)", () => {
		const cwd = createTempDir("limits-partial-");
		fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		fs.writeFileSync(
			path.join(cwd, ".pi", "settings.json"),
			JSON.stringify({ subagent: { maxParallel: 12 } }),
		);
		const limits = resolveSubagentLimits(cwd);
		expect(limits.maxParallel).toBe(12);
		expect(limits.maxConcurrency).toBe(DEFAULT_MAX_CONCURRENCY);
	});

	it("env vars override project settings", () => {
		const cwd = createTempDir("limits-env-");
		fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		fs.writeFileSync(
			path.join(cwd, ".pi", "settings.json"),
			JSON.stringify({ subagent: { maxParallel: 10, maxConcurrency: 5 } }),
		);
		process.env.PI_SUBAGENT_MAX_PARALLEL = "20";
		const limits = resolveSubagentLimits(cwd);
		expect(limits.maxParallel).toBe(20);
		expect(limits.maxConcurrency).toBe(5); // settings still used for unset fields
	});

	it("env var for concurrency only", () => {
		const cwd = createTempDir("limits-env2-");
		process.env.PI_SUBAGENT_MAX_CONCURRENCY = "8";
		const limits = resolveSubagentLimits(cwd);
		expect(limits.maxParallel).toBe(DEFAULT_MAX_PARALLEL);
		expect(limits.maxConcurrency).toBe(8);
	});

	it("ignores invalid values (falls back to defaults)", () => {
		const cwd = createTempDir("limits-invalid-");
		fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		fs.writeFileSync(
			path.join(cwd, ".pi", "settings.json"),
			JSON.stringify({ subagent: { maxParallel: -1, maxConcurrency: 0 } }),
		);
		const limits = resolveSubagentLimits(cwd);
		expect(limits.maxParallel).toBe(DEFAULT_MAX_PARALLEL);
		expect(limits.maxConcurrency).toBe(DEFAULT_MAX_CONCURRENCY);
	});

	it("ignores non-object subagent field", () => {
		const cwd = createTempDir("limits-badtype-");
		fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		fs.writeFileSync(
			path.join(cwd, ".pi", "settings.json"),
			JSON.stringify({ subagent: "wrong" }),
		);
		const limits = resolveSubagentLimits(cwd);
		expect(limits.maxParallel).toBe(DEFAULT_MAX_PARALLEL);
		expect(limits.maxConcurrency).toBe(DEFAULT_MAX_CONCURRENCY);
	});
});
