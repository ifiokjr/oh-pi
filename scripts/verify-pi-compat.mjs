#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MIN_VERSION = "0.56.1";
export const CURRENT_VERSION = "0.64.0";
export const PI_PACKAGES = [
	"@mariozechner/pi-agent-core",
	"@mariozechner/pi-ai",
	"@mariozechner/pi-coding-agent",
	"@mariozechner/pi-tui",
];
export const SMOKE_TESTS = [
	"packages/extensions/extensions/smoke.test.ts",
	"packages/diagnostics/tests/smoke.test.ts",
	"packages/ant-colony/tests/smoke.test.ts",
	"packages/subagents/tests/smoke.test.ts",
	"packages/spec/tests/smoke.test.ts",
	"packages/cursor/tests/smoke.test.ts",
	"packages/ollama/tests/smoke.test.ts",
];

export function parseArgs(argv, env = process.env) {
	const parsed = { version: env.PI_COMPAT_VERSION, restore: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if ((arg === "--version" || arg === "-v") && argv[i + 1]) {
			parsed.version = argv[++i];
			continue;
		}
		if (arg === "--restore") {
			parsed.restore = true;
		}
	}
	if (!parsed.version) {
		throw new Error("Missing pi compatibility version. Use --version <semver> or set PI_COMPAT_VERSION.");
	}
	return parsed;
}

export function run(command, args, options = {}) {
	console.log(`\n> ${command} ${args.join(" ")}`);
	execFileSync(command, args, {
		stdio: "inherit",
		env: process.env,
		...options,
	});
}

export function patchRootManifest(version) {
	const manifestPath = "package.json";
	const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
	pkg.devDependencies ??= {};
	for (const dependency of PI_PACKAGES) {
		pkg.devDependencies[dependency] = version;
	}
	writeFileSync(manifestPath, `${JSON.stringify(pkg, null, "\t")}\n`);
}

export function readInstalledVersions() {
	for (const dependency of PI_PACKAGES) {
		const packageJsonPath = `node_modules/${dependency}/package.json`;
		if (!existsSync(packageJsonPath)) {
			console.log(`${dependency}: missing`);
			continue;
		}
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		console.log(`${dependency}: ${pkg.version}`);
	}
}

export function restoreFiles(snapshot) {
	for (const [file, contents] of Object.entries(snapshot)) {
		if (contents === null) {
			continue;
		}
		writeFileSync(file, contents);
	}
}

export function main(argv = process.argv.slice(2)) {
	const { version, restore } = parseArgs(argv);
	const snapshot = {
		"package.json": readFileSync("package.json", "utf8"),
		"pnpm-lock.yaml": existsSync("pnpm-lock.yaml") ? readFileSync("pnpm-lock.yaml", "utf8") : null,
	};

	console.log(`Verifying pi compatibility against ${version}`);
	if (version === MIN_VERSION) {
		console.log("Mode: minimum supported baseline");
	} else if (version === CURRENT_VERSION) {
		console.log("Mode: current pinned upstream runtime");
	}

	try {
		patchRootManifest(version);
		run("pnpm", ["install", "--no-frozen-lockfile"]);
		console.log("\nInstalled pi package versions:");
		readInstalledVersions();
		run("pnpm", ["--filter", "@ifi/oh-pi-core", "build"]);
		run("pnpm", ["exec", "vitest", "run", ...SMOKE_TESTS]);
	} finally {
		if (restore) {
			console.log("\nRestoring package.json and pnpm-lock.yaml...");
			restoreFiles(snapshot);
			run("pnpm", ["install", "--frozen-lockfile"]);
		}
	}
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
	main();
}
