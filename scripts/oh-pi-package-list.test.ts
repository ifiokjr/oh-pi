import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	EXPERIMENTAL_PACKAGES,
	INSTALLER_PACKAGES,
	SWITCHER_PACKAGES,
} from "../packages/oh-pi/bin/package-list.mts";
import {
	EXPERIMENTAL_PACKAGES as RUNTIME_EXPERIMENTAL_PACKAGES,
	INSTALLER_PACKAGES as RUNTIME_INSTALLER_PACKAGES,
	SWITCHER_PACKAGES as RUNTIME_SWITCHER_PACKAGES,
} from "../packages/oh-pi/bin/package-list.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");
const installerPath = path.join(repoRoot, "packages", "oh-pi", "bin", "oh-pi.mjs");

afterEach(() => {
	vi.restoreAllMocks();
});

describe("oh-pi package list", () => {
	it("includes background tasks in the default installer bundle and switcher package set", () => {
		expect(INSTALLER_PACKAGES).toContain("@ifi/pi-background-tasks");
		expect(INSTALLER_PACKAGES.indexOf("@ifi/pi-background-tasks")).toBeGreaterThan(
			INSTALLER_PACKAGES.indexOf("@ifi/oh-pi-extensions"),
		);
		expect(EXPERIMENTAL_PACKAGES).not.toContain("@ifi/pi-background-tasks");
		expect(SWITCHER_PACKAGES).toEqual([...INSTALLER_PACKAGES, ...EXPERIMENTAL_PACKAGES]);
		expect(RUNTIME_INSTALLER_PACKAGES).toEqual(INSTALLER_PACKAGES);
		expect(RUNTIME_EXPERIMENTAL_PACKAGES).toEqual(EXPERIMENTAL_PACKAGES);
		expect(RUNTIME_SWITCHER_PACKAGES).toEqual(SWITCHER_PACKAGES);
	});

	it("prints the installer package list in --help output", () => {
		const output = execFileSync(process.execPath, [installerPath, "--help"], {
			cwd: repoRoot,
			encoding: "utf8",
		});

		expect(output).toContain("@ifi/pi-background-tasks");
		expect(output).toContain("@ifi/oh-pi-extensions");
	});

	it("loads the installer entrypoint with the package list import", async () => {
		const originalArgv = process.argv;
		const exit = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
			throw new Error(`exit:${code ?? 0}`);
		}) as never);
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

		try {
			process.argv = [process.execPath, installerPath, "--help"];
			await import(`${pathToFileURL(installerPath).href}?test=${Date.now()}`);
		} catch (error) {
			expect(error).toEqual(new Error("exit:0"));
		} finally {
			process.argv = originalArgv;
		}

		expect(exit).toHaveBeenCalledWith(0);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("@ifi/pi-background-tasks"));
	});
});
