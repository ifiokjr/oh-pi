#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const PACKAGE_NAME = "@ifi/pi-extension-subagents";

function parseArgs(argv) {
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
			console.error(`Unknown argument: ${arg}`);
			process.exit(1);
		}
	}

	return { help, local, remove };
}

function printHelp() {
	console.log(
		`
pi-extension-subagents — install the @ifi subagents extension into pi

Usage:
  npx @ifi/pi-extension-subagents            Install globally
  npx @ifi/pi-extension-subagents --local    Install into project .pi/settings.json
  npx @ifi/pi-extension-subagents --remove   Remove from pi

Options:
  -l, --local    Install project-locally instead of globally
  -r, --remove   Remove the package from pi
  -h, --help     Show this help

Direct install:
  pi install npm:${PACKAGE_NAME}
`.trim(),
	);
}

function findPi() {
	try {
		execFileSync("pi", ["--version"], { stdio: "ignore" });
		return "pi";
	} catch {
		console.error("Error: 'pi' command not found. Install pi-coding-agent first:");
		console.error("  npm install -g @mariozechner/pi-coding-agent");
		process.exit(1);
	}
}

const opts = parseArgs(process.argv);
if (opts.help) {
	printHelp();
	process.exit(0);
}

function run(pi, command, args) {
	try {
		execFileSync(pi, [command, ...args], { stdio: "pipe", timeout: 60_000 });
		return { ok: true, status: "ok" };
	} catch (error) {
		const stderr = error?.stderr?.toString?.().trim?.() ?? "";
		if (stderr.includes("already installed") || stderr.includes("already exists")) {
			return { ok: true, status: "already-installed" };
		}
		if (stderr.includes("not installed") || stderr.includes("not found") || stderr.includes("No such")) {
			return { ok: true, status: "already-removed" };
		}
		if (stderr) {
			console.error(stderr.split("\n")[0]);
		}
		return { ok: false, status: "error" };
	}
}

const pi = findPi();
const source = `npm:${PACKAGE_NAME}`;
const localFlag = opts.local ? ["-l"] : [];
const result = opts.remove ? run(pi, "remove", [source, ...localFlag]) : run(pi, "install", [source, ...localFlag]);

if (!result.ok) {
	process.exit(1);
}

if (opts.remove) {
	console.log(
		result.status === "already-removed"
			? "\n✅ @ifi/pi-extension-subagents is already absent from pi."
			: "\n✅ Removed @ifi/pi-extension-subagents from pi.",
	);
} else {
	console.log(
		result.status === "already-installed"
			? "\n✅ @ifi/pi-extension-subagents is already installed in pi."
			: "\n✅ Installed @ifi/pi-extension-subagents into pi. Restart pi to load it.",
	);
}
