import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	expandHomeDir,
	getExtensionConfigPath,
	getMirroredWorkspacePathSegments,
	getSharedStoragePath,
	resolvePiAgentDir,
} from "./agent-paths.js";

describe("agent path utilities", () => {
	it("uses the default ~/.pi/agent path when no override is set", () => {
		expect(resolvePiAgentDir({ env: {}, homeDir: "/mock-home" })).toBe(path.join("/mock-home", ".pi", "agent"));
	});

	it("honors PI_CODING_AGENT_DIR overrides", () => {
		expect(resolvePiAgentDir({ env: { PI_CODING_AGENT_DIR: "/tmp/custom-agent" }, homeDir: "/mock-home" })).toBe(
			"/tmp/custom-agent",
		);
	});

	it("expands ~ in PI_CODING_AGENT_DIR overrides", () => {
		expect(resolvePiAgentDir({ env: { PI_CODING_AGENT_DIR: "~/agent-data" }, homeDir: "/mock-home" })).toBe(
			path.join("/mock-home", "agent-data"),
		);
	});

	it("builds extension config paths under the resolved agent dir", () => {
		expect(getExtensionConfigPath("scheduler", "config.json", { env: {}, homeDir: "/mock-home" })).toBe(
			path.join("/mock-home", ".pi", "agent", "extensions", "scheduler", "config.json"),
		);
	});

	it("mirrors workspace paths for shared storage", () => {
		expect(getMirroredWorkspacePathSegments("/Users/test/work/repo")).toEqual([
			"root",
			"Users",
			"test",
			"work",
			"repo",
		]);
	});

	it("builds shared storage paths inside the resolved agent dir", () => {
		expect(
			getSharedStoragePath("scheduler", "/Users/test/work/repo", ["scheduler.json"], {
				env: {},
				homeDir: "/mock-home",
			}),
		).toBe(
			path.join("/mock-home", ".pi", "agent", "scheduler", "root", "Users", "test", "work", "repo", "scheduler.json"),
		);
	});

	it("expands home directory shortcuts directly", () => {
		expect(expandHomeDir("~/nested/path", { homeDir: "/mock-home" })).toBe(path.join("/mock-home", "nested", "path"));
	});
});
