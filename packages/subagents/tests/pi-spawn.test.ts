import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { getPiSpawnCommand, type PiSpawnDeps, resolveWindowsPiCliScript } from "../pi-spawn.js";

function makeDeps(input: {
	platform?: NodeJS.Platform;
	execPath?: string;
	argv1?: string;
	existing?: string[];
	packageJsonPath?: string;
	packageJsonContent?: string;
}): PiSpawnDeps {
	const existing = new Set(input.existing ?? []);
	const packageJsonPath = input.packageJsonPath;
	const packageJsonContent = input.packageJsonContent;

	return {
		platform: input.platform,
		execPath: input.execPath,
		argv1: input.argv1,
		existsSync: (filePath) => existing.has(filePath),
		readFileSync: () => {
			if (!(packageJsonPath && packageJsonContent)) {
				throw new Error("package json not configured");
			}
			return packageJsonContent;
		},
		resolvePackageJson: () => {
			if (!packageJsonPath) {
				throw new Error("package json path missing");
			}
			return packageJsonPath;
		},
	};
}

describe("getPiSpawnCommand", () => {
	it("uses the plain pi command on non-Windows platforms", () => {
		const args = ["--mode", "json", "Task: check output"];
		const result = getPiSpawnCommand(args, { platform: "darwin" });
		expect(result).toEqual({ command: "pi", args });
	});

	it("uses node plus argv1 on Windows when argv1 is a runnable script", () => {
		const argv1 = "/tmp/pi-entry.mjs";
		const deps = makeDeps({
			platform: "win32",
			execPath: "/usr/local/bin/node",
			argv1,
			existing: [argv1],
		});
		const args = ["--mode", "json", 'Task: Read C:/dev/file.md and review "quotes" & pipes | too'];
		const result = getPiSpawnCommand(args, deps);
		expect(result.command).toBe("/usr/local/bin/node");
		expect(result.args[0]).toBe(argv1);
		expect(result.args[3]).toBe(args[2]);
	});

	it("resolves the CLI script from package bin metadata when argv1 is not runnable", () => {
		const packageJsonPath = "/opt/pi/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.js");
		const deps = makeDeps({
			platform: "win32",
			execPath: "/usr/local/bin/node",
			argv1: "/opt/pi/subagent-runner.ts",
			packageJsonPath,
			packageJsonContent: JSON.stringify({ bin: { pi: "dist/cli/index.js" } }),
			existing: [packageJsonPath, cliPath],
		});
		const result = getPiSpawnCommand(["-p", "Task: hello"], deps);
		expect(result.command).toBe("/usr/local/bin/node");
		expect(result.args[0]).toBe(cliPath);
	});

	it("falls back to pi when the Windows CLI script cannot be resolved", () => {
		const args = ["-p", "Task: hello"];
		const result = getPiSpawnCommand(
			args,
			makeDeps({
				platform: "win32",
				argv1: "/opt/pi/subagent-runner.ts",
				existing: [],
			}),
		);
		expect(result).toEqual({ command: "pi", args });
	});
});

describe("getPiSpawnCommand with piPackageRoot", () => {
	it("resolves the CLI script via piPackageRoot when argv1 is not runnable", () => {
		const packageJsonPath = "/opt/pi/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.js");
		const deps = makeDeps({
			platform: "win32",
			execPath: "/usr/local/bin/node",
			argv1: "/opt/pi/subagent-runner.ts",
			packageJsonPath,
			packageJsonContent: JSON.stringify({ bin: { pi: "dist/cli/index.js" } }),
			existing: [packageJsonPath, cliPath],
		});
		deps.piPackageRoot = "/opt/pi";
		const result = getPiSpawnCommand(["-p", "Task: hello"], deps);
		expect(result.command).toBe("/usr/local/bin/node");
		expect(result.args[0]).toBe(cliPath);
	});
});

describe("resolveWindowsPiCliScript", () => {
	it("supports package bin entries declared as a string", () => {
		const packageJsonPath = "/opt/pi/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.mjs");
		const deps = makeDeps({
			platform: "win32",
			argv1: "/opt/pi/subagent-runner.ts",
			packageJsonPath,
			packageJsonContent: JSON.stringify({ bin: "dist/cli/index.mjs" }),
			existing: [packageJsonPath, cliPath],
		});
		expect(resolveWindowsPiCliScript(deps)).toBe(cliPath);
	});
});
