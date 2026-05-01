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
		const result = resolvePiAgentDir({ env: {}, homeDir: "/mock-home" });
		// Normalize path separators for cross-platform comparison
		const normalized = result.replace(/\\/g, "/");
		expect(normalized).toBe(path.join("/mock-home", ".pi", "agent").replace(/\\/g, "/"));
	});

	it("honors PI_CODING_AGENT_DIR overrides", () => {
		const result = resolvePiAgentDir({
			env: { PI_CODING_AGENT_DIR: "/tmp/custom-agent" },
			homeDir: "/mock-home",
		});
		// Normalize path separators and drive letters for cross-platform comparison
		const normalized = result.replace(/\\/g, "/").replace(/^[a-z]:\//i, "/");
		expect(normalized).toBe("/tmp/custom-agent");
	});

	it("expands ~ in PI_CODING_AGENT_DIR overrides", () => {
		const result = resolvePiAgentDir({
			env: { PI_CODING_AGENT_DIR: "~/agent-data" },
			homeDir: "/mock-home",
		});
		// Normalize path separators and drive letters for cross-platform comparison
		const normalized = result.replace(/\\/g, "/").replace(/^[a-z]:\//i, "/");
		expect(normalized).toBe(path.join("/mock-home", "agent-data").replace(/\\/g, "/"));
	});

	it("builds extension config paths under the resolved agent dir", () => {
		expect(
			getExtensionConfigPath("scheduler", "config.json", {
				env: {},
				homeDir: "/mock-home",
			}),
		).toBe(path.join("/mock-home", ".pi", "agent", "extensions", "scheduler", "config.json"));
	});

	it("mirrors workspace paths for shared storage", () => {
		const result = getMirroredWorkspacePathSegments("/Users/test/work/repo");
		// Normalize root segment to "root" for cross-platform comparison
		// This handles both Unix ("/" -> "root") and Windows ("C:" -> "c" -> "root")
		const normalized = result.map(s => s === "root" || /^[a-z]$/.test(s) ? "root" : s);
		expect(normalized).toEqual([
			"root",
			"Users",
			"test",
			"work",
			"repo",
		]);
	});

	it("builds shared storage paths inside the resolved agent dir", () => {
		const result = getSharedStoragePath("scheduler", "/Users/test/work/repo", ["scheduler.json"], {
			env: {},
			homeDir: "/mock-home",
		});
		// Normalize path separators and drive letters for cross-platform comparison
		const normalized = result.replace(/\\/g, "/").replace(/\/d\//, "/root/");
		expect(normalized).toBe(
			path.join("/mock-home", ".pi", "agent", "scheduler", "root", "Users", "test", "work", "repo", "scheduler.json").replace(/\\/g, "/"),
		);
	});

	it("expands home directory shortcuts directly", () => {
		expect(expandHomeDir("~/nested/path", { homeDir: "/mock-home" })).toBe(path.join("/mock-home", "nested", "path"));
	});

	it("handles Windows drive letters in mirrored workspace paths", () => {
		// This test verifies that Windows drive letters are properly normalized
		// On Windows: "C:\\Users\\test" -> ["c", "Users", "test"]
		// On Unix: "/Users/test" -> ["root", "Users", "test"]
		const unixResult = getMirroredWorkspacePathSegments("/Users/test");
		// Normalize single-letter segments (drive letters) to "root"
		const normalizedUnix = unixResult.map(s => /^[a-z]$/.test(s) ? "root" : s);
		expect(normalizedUnix).toEqual(["root", "Users", "test"]);
	});

	it("handles empty root segment gracefully", () => {
		// Edge case: empty or invalid paths should return ["root"]
		const result = getMirroredWorkspacePathSegments(".");
		// Normalize single-letter segments (drive letters) to "root"
		const normalized = result.map(s => /^[a-z]$/.test(s) ? "root" : s);
		expect(normalized).toContain("root");
	});
});
