import * as path from "node:path";

import { getPiSpawnCommand, resolveWindowsPiCliScript } from "../pi-spawn.js";
import type { PiSpawnDeps } from "../pi-spawn.js";

function makeDeps(input: {
	platform?: NodeJS.Platform;
	execPath?: string;
	argv1?: string;
	existing?: string[];
	packageJsonPath?: string;
	packageJsonContent?: string;
}): PiSpawnDeps {
	const existing = new Set(input.existing ?? []);
	const { packageJsonPath } = input;
	const { packageJsonContent } = input;

	return {
		argv1: input.argv1,
		execPath: input.execPath,
		existsSync: (filePath) => existing.has(filePath),
		platform: input.platform,
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

describe(getPiSpawnCommand, () => {
	it("uses the plain pi command on non-Windows platforms", () => {
		const args = ["--mode", "json", "Task: check output"];
		const result = getPiSpawnCommand(args, { platform: "darwin" });
		expect(result).toStrictEqual({ args, command: "pi" });
	});

	it("uses node plus argv1 on Windows when argv1 is a runnable script", () => {
		const argv1 = "/tmp/pi-entry.mjs";
		const deps = makeDeps({
			argv1,
			execPath: "/usr/local/bin/node",
			existing: [argv1],
			platform: "win32",
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
			argv1: "/opt/pi/subagent-runner.ts",
			execPath: "/usr/local/bin/node",
			existing: [packageJsonPath, cliPath],
			packageJsonContent: JSON.stringify({ bin: { pi: "dist/cli/index.js" } }),
			packageJsonPath,
			platform: "win32",
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
				argv1: "/opt/pi/subagent-runner.ts",
				existing: [],
				platform: "win32",
			}),
		);
		expect(result).toStrictEqual({ args, command: "pi" });
	});
});

describe("getPiSpawnCommand with piPackageRoot", () => {
	it("resolves the CLI script via piPackageRoot when argv1 is not runnable", () => {
		const packageJsonPath = "/opt/pi/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.js");
		const deps = makeDeps({
			argv1: "/opt/pi/subagent-runner.ts",
			execPath: "/usr/local/bin/node",
			existing: [packageJsonPath, cliPath],
			packageJsonContent: JSON.stringify({ bin: { pi: "dist/cli/index.js" } }),
			packageJsonPath,
			platform: "win32",
		});
		deps.piPackageRoot = "/opt/pi";
		const result = getPiSpawnCommand(["-p", "Task: hello"], deps);
		expect(result.command).toBe("/usr/local/bin/node");
		expect(result.args[0]).toBe(cliPath);
	});
});

describe(resolveWindowsPiCliScript, () => {
	it("supports package bin entries declared as a string", () => {
		const packageJsonPath = "/opt/pi/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.mjs");
		const deps = makeDeps({
			argv1: "/opt/pi/subagent-runner.ts",
			existing: [packageJsonPath, cliPath],
			packageJsonContent: JSON.stringify({ bin: "dist/cli/index.mjs" }),
			packageJsonPath,
			platform: "win32",
		});
		expect(resolveWindowsPiCliScript(deps)).toBe(cliPath);
	});
});
