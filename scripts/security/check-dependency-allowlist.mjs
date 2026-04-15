#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const LOCAL_PROTOCOLS = ["workspace:", "file:", "link:"];
const DISALLOWED_PROTOCOL_RE = /^(?:github:|git\+|git:|ssh:|https?:)/i;

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function manifestPaths(rootDir) {
	const rootManifest = join(rootDir, "package.json");
	const packageDir = join(rootDir, "packages");
	const packageManifests = readdirSync(packageDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(packageDir, entry.name, "package.json"))
		.filter((path) => existsSync(path));
	return [rootManifest, ...packageManifests];
}

function workspacePackageNames(rootDir) {
	return new Set(
		manifestPaths(rootDir)
			.map((manifestPath) => readJson(manifestPath).name)
			.filter((name) => typeof name === "string" && name.length > 0),
	);
}

function normalizeRelPath(rootDir, path) {
	return path.startsWith(`${rootDir}/`) ? path.slice(rootDir.length + 1) : path;
}

const rootDir = process.cwd();
const allowlistPath = join(rootDir, "security", "dependency-allowlist.json");
if (!existsSync(allowlistPath)) {
	console.error(`❌ Missing allowlist file: ${normalizeRelPath(rootDir, allowlistPath)}`);
	process.exit(1);
}

const allowlist = readJson(allowlistPath);
const allowedPackages = new Set(allowlist.packages ?? []);
const workspacePackages = workspacePackageNames(rootDir);
const unknownDeps = [];
const suspiciousSpecs = [];
let checked = 0;

for (const manifestPath of manifestPaths(rootDir)) {
	const manifest = readJson(manifestPath);
	const relPath = normalizeRelPath(rootDir, manifestPath);

	for (const field of DEP_FIELDS) {
		const deps = manifest[field] ?? {};
		for (const [name, spec] of Object.entries(deps)) {
			if (typeof spec !== "string") {
				continue;
			}
			if (LOCAL_PROTOCOLS.some((prefix) => spec.startsWith(prefix)) || workspacePackages.has(name)) {
				continue;
			}

			checked += 1;
			if (!allowedPackages.has(name)) {
				unknownDeps.push({ relPath, field, name, spec });
			}
			if (DISALLOWED_PROTOCOL_RE.test(spec)) {
				suspiciousSpecs.push({ relPath, field, name, spec });
			}
		}
	}
}

if (unknownDeps.length > 0 || suspiciousSpecs.length > 0) {
	console.error("❌ Dependency trust policy failed.");

	if (unknownDeps.length > 0) {
		console.error("\nUnapproved direct dependencies:");
		for (const dep of unknownDeps) {
			console.error(`  - ${dep.name}@${dep.spec} (${dep.relPath} :: ${dep.field})`);
		}
	}

	if (suspiciousSpecs.length > 0) {
		console.error("\nDisallowed dependency spec protocols (git/http/etc):");
		for (const dep of suspiciousSpecs) {
			console.error(`  - ${dep.name}@${dep.spec} (${dep.relPath} :: ${dep.field})`);
		}
	}

	console.error("\nReview and approve new packages before shipping by editing security/dependency-allowlist.json.");
	process.exit(1);
}

console.log(`✅ Dependency allowlist check passed (${checked} external direct dependency entries checked).`);
