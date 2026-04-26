#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "@ifi/pi-background-tasks";

export function parseArgs(argv) {
	const args = argv.slice(2);
	let local = false;
	let remove = false;
	let help = false;

	for (const arg of args) {
		if (arg === "--local" || arg === "-l") {
			local = true;
		} else if (arg === "--remove" || arg === "-r") {
			remove = true;
		} else if (arg === "--help" || arg === "-h") {
			help = true;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return { help, local, remove };
}

export function printHelp(log = console.log) {
	log(
		`
pi-background-tasks — install the @ifi background task extension into pi

Usage:
  npx @ifi/pi-background-tasks            Install globally
  npx @ifi/pi-background-tasks --local    Install into project .pi/settings.json
  npx @ifi/pi-background-tasks --remove   Remove from pi

Options:
  -l, --local    Install project-locally instead of globally
  -r, --remove   Remove the package from pi
  -h, --help     Show this help

Direct install:
  pi install npm:${PACKAGE_NAME}
`.trim(),
	);
}

export function findPi(execute = execFileSync) {
	try {
		execute("pi", ["--version"], { stdio: "ignore" });
		return "pi";
	} catch {
		return null;
	}
}

export function run(pi, command, args, execute = execFileSync, error = console.error) {
	try {
		execute(pi, [command, ...args], { stdio: "pipe", timeout: 60_000 });
		return { ok: true, status: "ok" };
	} catch (caughtError) {
		const stderr = caughtError?.stderr?.toString?.().trim?.() ?? "";
		if (stderr.includes("already installed") || stderr.includes("already exists")) {
			return { ok: true, status: "already-installed" };
		}
		if (stderr.includes("not installed") || stderr.includes("not found") || stderr.includes("No such")) {
			return { ok: true, status: "already-removed" };
		}
		if (stderr) {
			error(stderr.split("\n")[0]);
		}
		return { ok: false, status: "error" };
	}
}

export function main(argv = process.argv, { execute = execFileSync, log = console.log, error = console.error } = {}) {
	let opts;
	try {
		opts = parseArgs(argv);
	} catch (caughtError) {
		error(caughtError instanceof Error ? caughtError.message : String(caughtError));
		return 1;
	}

	if (opts.help) {
		printHelp(log);
		return 0;
	}

	const pi = findPi(execute);
	if (!pi) {
		error("Error: 'pi' command not found. Install pi-coding-agent first:");
		error("  npm install -g @mariozechner/pi-coding-agent");
		return 1;
	}

	const source = `npm:${PACKAGE_NAME}`;
	const localFlag = opts.local ? ["-l"] : [];
	const result = opts.remove
		? run(pi, "remove", [source, ...localFlag], execute, error)
		: run(pi, "install", [source, ...localFlag], execute, error);

	if (!result.ok) {
		return 1;
	}

	if (opts.remove) {
		log(
			result.status === "already-removed"
				? "\n✅ @ifi/pi-background-tasks is already absent from pi."
				: "\n✅ Removed @ifi/pi-background-tasks from pi.",
		);
	} else {
		log(
			result.status === "already-installed"
				? "\n✅ @ifi/pi-background-tasks is already installed in pi."
				: "\n✅ Installed @ifi/pi-background-tasks into pi. Restart pi to load it.",
		);
	}

	return 0;
}

const isMain = process.argv[1] && import.meta.filename === process.argv[1];

if (isMain) {
	process.exitCode = main();
}
