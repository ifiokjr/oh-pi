#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const RETIRED_AUDIT_PATTERNS = [
	"ERR_PNPM_AUDIT_BAD_RESPONSE",
	"responded with 410",
	"Use the bulk advisory endpoint instead",
];

function writeIfPresent(stream, value) {
	if (!value) {
		return;
	}

	stream.write(value);
	if (!value.endsWith("\n")) {
		stream.write("\n");
	}
}

function isRetiredAuditEndpointError(output) {
	return RETIRED_AUDIT_PATTERNS.every((pattern) => output.includes(pattern));
}

const pnpmBin = process.env.OH_PI_AUDIT_BIN || "pnpm";
const pnpmArgs = ["audit", ...process.argv.slice(2)];
const result = spawnSync(pnpmBin, pnpmArgs, {
	encoding: "utf8",
	env: process.env,
});

if (result.error) {
	console.error(`❌ Failed to launch ${pnpmBin}: ${result.error.message}`);
	process.exit(1);
}

const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join("\n");

writeIfPresent(process.stdout, result.stdout);
writeIfPresent(process.stderr, result.stderr);

if (result.status === 0) {
	process.exit(0);
}

if (isRetiredAuditEndpointError(combinedOutput)) {
	console.warn("⚠️ pnpm audit hit npm's retired audit endpoints and will be treated as a non-fatal upstream failure.");
	console.warn(
		"⚠️ Dependency allowlist checks and GitHub Dependency Review still run in CI while this fallback is active.",
	);
	process.exit(0);
}

process.exit(result.status ?? 1);
