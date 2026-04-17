import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({
	execFileSyncMock: vi.fn(() => Buffer.from("")),
}));

vi.mock("node:child_process", () => ({
	execFileSync: execFileSyncMock,
}));

import { CURRENT_VERSION, MIN_VERSION, SMOKE_TESTS, WORKSPACE_INSTALL_ARGS, main, parseArgs } from "./verify-pi-compat.mjs";

const tempDirs: string[] = [];
const originalCwd = process.cwd();

function createTempDir(prefix: string): string {
	const dir = mkdtempSync(path.join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	process.chdir(originalCwd);
	execFileSyncMock.mockClear();
	vi.restoreAllMocks();
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("verify pi compatibility script", () => {
	it("includes the diagnostics smoke test in compatibility runs", () => {
		expect(SMOKE_TESTS).toContain("packages/diagnostics/tests/smoke.test.ts");
	});

	it("installs with workspace linking enabled", () => {
		expect(WORKSPACE_INSTALL_ARGS).toEqual(["install", "--no-frozen-lockfile", "--link-workspace-packages"]);
	});

	it("parses explicit versions and restore mode", () => {
		expect(parseArgs(["--version", CURRENT_VERSION, "--restore"], {})).toEqual({
			restore: true,
			version: CURRENT_VERSION,
		});
		expect(parseArgs([], { PI_COMPAT_VERSION: MIN_VERSION })).toEqual({
			restore: false,
			version: MIN_VERSION,
		});
		expect(() => parseArgs([], {})).toThrow("Missing pi compatibility version");
	});

	it("runs the compatibility install with workspace linking", () => {
		const repoDir = createTempDir("oh-pi-compat-");
		writeFileSync(path.join(repoDir, "package.json"), JSON.stringify({ name: "test-repo" }));
		process.chdir(repoDir);

		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		main(["--version", CURRENT_VERSION]);

		expect(execFileSyncMock).toHaveBeenNthCalledWith(
			1,
			"pnpm",
			["install", "--no-frozen-lockfile", "--link-workspace-packages"],
			expect.objectContaining({ env: process.env, stdio: "inherit" }),
		);
		expect(execFileSyncMock).toHaveBeenNthCalledWith(
			2,
			"pnpm",
			["--filter", "@ifi/oh-pi-core", "build"],
			expect.objectContaining({ env: process.env, stdio: "inherit" }),
		);
		expect(execFileSyncMock).toHaveBeenNthCalledWith(
			3,
			"pnpm",
			["exec", "vitest", "run", ...SMOKE_TESTS],
			expect.objectContaining({ env: process.env, stdio: "inherit" }),
		);
		expect(log).toHaveBeenCalledWith(`Verifying pi compatibility against ${CURRENT_VERSION}`);
	});
});
