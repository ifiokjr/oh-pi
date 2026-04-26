import { fileURLToPath } from "node:url";

// @ts-expect-error missing declaration file for runtime installer script
import { PACKAGE_NAME, findPi, main, parseArgs, printHelp, run } from "../install.mjs";

describe("background task installer", () => {
	it("parses supported flags and rejects unknown ones", () => {
		expect(parseArgs(["node", "install.mjs"])).toStrictEqual({ help: false, local: false, remove: false });
		expect(parseArgs(["node", "install.mjs", "--local", "--remove", "-h"])).toStrictEqual({
			help: true,
			local: true,
			remove: true,
		});
		expect(() => parseArgs(["node", "install.mjs", "--wat"])).toThrow("Unknown argument: --wat");
	});

	it("prints help text with the package source", () => {
		const log = vi.fn();
		printHelp(log);
		expect(log).toHaveBeenCalledWith(expect.stringContaining(`pi install npm:${PACKAGE_NAME}`));
	});

	it("detects whether the pi binary is available", () => {
		expect(findPi(vi.fn())).toBe("pi");
		expect(
			findPi(
				vi.fn(() => {
					throw new Error("missing");
				}),
			),
		).toBeNull();
	});

	it("normalizes install and removal command outcomes", () => {
		const error = vi.fn();
		expect(run("pi", "install", ["npm:@ifi/pi-background-tasks"], vi.fn(), error)).toStrictEqual({ ok: true, status: "ok" });
		expect(
			run(
				"pi",
				"install",
				["npm:@ifi/pi-background-tasks"],
				vi.fn(() => {
					throw { stderr: Buffer.from("already installed") };
				}),
				error,
			),
		).toStrictEqual({ ok: true, status: "already-installed" });
		expect(
			run(
				"pi",
				"remove",
				["npm:@ifi/pi-background-tasks"],
				vi.fn(() => {
					throw { stderr: Buffer.from("not installed") };
				}),
				error,
			),
		).toStrictEqual({ ok: true, status: "already-removed" });
		expect(
			run(
				"pi",
				"install",
				["npm:@ifi/pi-background-tasks"],
				vi.fn(() => {
					throw { stderr: Buffer.from("fatal problem\nsecond line") };
				}),
				error,
			),
		).toStrictEqual({ ok: false, status: "error" });
		expect(error).toHaveBeenLastCalledWith("fatal problem");
	});

	it("returns exit codes and messages for help, missing pi, installs, removals, and failures", () => {
		const log = vi.fn();
		const error = vi.fn();

		expect(main(["node", "install.mjs", "--help"], { error, execute: vi.fn(), log })).toBe(0);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));

		expect(main(["node", "install.mjs", "--wat"], { error, execute: vi.fn(), log })).toBe(1);
		expect(error).toHaveBeenCalledWith("Unknown argument: --wat");

		const missingPiExecute = vi.fn(() => {
			throw new Error("missing");
		});
		expect(main(["node", "install.mjs"], { error, execute: missingPiExecute, log })).toBe(1);
		expect(error).toHaveBeenCalledWith("Error: 'pi' command not found. Install pi-coding-agent first:");

		const installExecute = vi.fn((command: string, args: string[]) => {
			if (args[0] === "--version") {
				return Buffer.from("0.1.0");
			}
			return Buffer.from("");
		});
		expect(main(["node", "install.mjs", "--local"], { error, execute: installExecute, log })).toBe(0);
		expect(installExecute).toHaveBeenCalledWith("pi", ["install", `npm:${PACKAGE_NAME}`, "-l"], {
			stdio: "pipe",
			timeout: 60_000,
		});
		expect(log).toHaveBeenLastCalledWith("\n✅ Installed @ifi/pi-background-tasks into pi. Restart pi to load it.");

		const alreadyRemovedExecute = vi.fn((command: string, args: string[]) => {
			if (args[0] === "--version") {
				return Buffer.from("0.1.0");
			}
			throw { stderr: Buffer.from("not found") };
		});
		expect(main(["node", "install.mjs", "--remove"], { error, execute: alreadyRemovedExecute, log })).toBe(0);
		expect(log).toHaveBeenLastCalledWith("\n✅ @ifi/pi-background-tasks is already absent from pi.");

		const alreadyInstalledExecute = vi.fn((command: string, args: string[]) => {
			if (args[0] === "--version") {
				return Buffer.from("0.1.0");
			}
			throw { stderr: Buffer.from("already exists") };
		});
		expect(main(["node", "install.mjs"], { error, execute: alreadyInstalledExecute, log })).toBe(0);
		expect(log).toHaveBeenLastCalledWith("\n✅ @ifi/pi-background-tasks is already installed in pi.");

		const failingExecute = vi.fn((command: string, args: string[]) => {
			if (args[0] === "--version") {
				return Buffer.from("0.1.0");
			}
			throw { stderr: Buffer.from("permission denied") };
		});
		expect(main(["node", "install.mjs"], { error, execute: failingExecute, log })).toBe(1);
		expect(error).toHaveBeenLastCalledWith("permission denied");
	});

	it("executes the entrypoint when imported as the main module", async () => {
		vi.resetModules();
		const scriptPath = fileURLToPath(new URL("../install.mjs", import.meta.url));
		const originalArgv = process.argv;
		const originalExitCode = process.exitCode;
		const log = vi.spyOn(console, "log").mockReturnValue(undefined);

		process.argv = ["node", scriptPath, "--help"];
		process.exitCode = undefined;
		// @ts-expect-error missing declaration file for runtime installer script
		await import("../install.mjs");

		expect(process.exitCode).toBe(0);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));

		log.mockRestore();
		process.argv = originalArgv;
		process.exitCode = originalExitCode;
		vi.resetModules();
	});
});
