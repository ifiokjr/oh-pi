#!/usr/bin/env node

/**
 * oh-pi installer — registers all oh-pi sub-packages with pi.
 *
 * Usage:
 *   npx @ifi/oh-pi              # install latest versions
 *   npx @ifi/oh-pi --version 0.2.12  # install a specific version
 *   npx @ifi/oh-pi --local      # install to project .pi/settings.json
 *   npx @ifi/oh-pi --remove     # uninstall all oh-pi packages from pi
 */

import { execFileSync } from "node:child_process";

const PACKAGES = [
	"@ifi/oh-pi-extensions",
	"@ifi/oh-pi-ant-colony",
	"@ifi/pi-extension-subagents",
	"@ifi/oh-pi-themes",
	"@ifi/oh-pi-prompts",
	"@ifi/oh-pi-skills",
];

function parseArgs(argv) {
	const args = argv.slice(2);
	let version = null;
	let local = false;
	let remove = false;
	let help = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--version" || arg === "-v") {
			version = args[++i] ?? null;
			if (!version) {
				console.error("Error: --version requires a value");
				process.exit(1);
			}
		} else if (arg === "--local" || arg === "-l") {
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

	return { version, local, remove, help };
}

function printHelp() {
	console.log(`
oh-pi — install all oh-pi packages into pi

Usage:
  npx @ifi/oh-pi                    Install latest versions (global)
  npx @ifi/oh-pi --version 0.2.11   Install a specific version
  npx @ifi/oh-pi --local            Install to project (.pi/settings.json)
  npx @ifi/oh-pi --remove           Uninstall all oh-pi packages from pi

Options:
  -v, --version <ver>   Pin all packages to a specific version
  -l, --local           Install project-locally instead of globally
  -r, --remove          Remove all oh-pi packages from pi
  -h, --help            Show this help

Packages installed:
${PACKAGES.map((p) => `  • ${p}`).join("\n")}
`.trim());
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

function run(pi, command, args, { label }) {
	const display = [pi, command, ...args].join(" ");
	process.stdout.write(`  ${label} ... `);
	try {
		execFileSync(pi, [command, ...args], { stdio: "pipe", timeout: 60_000 });
		console.log("✓");
	} catch (error) {
		const stderr = error.stderr?.toString().trim();
		// pi install exits 0 on success; treat already-installed as success
		if (stderr?.includes("already installed") || stderr?.includes("already exists")) {
			console.log("✓ (already installed)");
		} else {
			console.log("✗");
			if (stderr) {
				console.error(`    ${stderr.split("\n")[0]}`);
			}
			return false;
		}
	}
	return true;
}

const opts = parseArgs(process.argv);

if (opts.help) {
	printHelp();
	process.exit(0);
}

const pi = findPi();
const localFlag = opts.local ? ["-l"] : [];

if (opts.remove) {
	console.log("\n🐜 Removing oh-pi packages from pi...\n");
	let failures = 0;
	for (const pkg of PACKAGES) {
		const ok = run(pi, "remove", [`npm:${pkg}`, ...localFlag], { label: pkg });
		if (!ok) failures++;
	}
	console.log(failures === 0 ? "\n✅ All oh-pi packages removed." : `\n⚠️  ${failures} package(s) could not be removed.`);
	process.exit(failures > 0 ? 1 : 0);
}

const suffix = opts.version ? `@${opts.version}` : "";
const scope = opts.local ? "project" : "global";

console.log(`\n🐜 Installing oh-pi packages into pi (${scope})...\n`);

let failures = 0;
for (const pkg of PACKAGES) {
	const source = `npm:${pkg}${suffix}`;
	const ok = run(pi, "install", [source, ...localFlag], { label: pkg });
	if (!ok) failures++;
}

if (failures === 0) {
	console.log("\n✅ All oh-pi packages installed. Restart pi to load them.");
} else {
	console.log(`\n⚠️  ${failures} package(s) failed to install. Check the errors above.`);
}

process.exit(failures > 0 ? 1 : 0);
