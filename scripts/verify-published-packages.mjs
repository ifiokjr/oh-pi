import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { publishedPackages } from "./package-classes.mjs";

function normalizePackageEntry(entry) {
	return entry.replace(/^\.\//, "");
}

function verifyExtensionEntrypoints(pkg, manifest, packedFiles) {
	const extensionEntries = manifest.pi?.extensions ?? [];
	const packedPaths = new Set(packedFiles.map((file) => file.path));

	for (const entry of extensionEntries) {
		const normalizedEntry = normalizePackageEntry(entry);
		const absoluteEntry = path.resolve(pkg.dir, normalizedEntry);
		if (!fs.existsSync(absoluteEntry)) {
			throw new Error(`${pkg.name}: pi.extensions entry does not exist: ${entry}`);
		}
		const stat = fs.statSync(absoluteEntry);
		if (!stat.isFile()) {
			throw new Error(`${pkg.name}: pi.extensions entries must reference explicit files, not directories: ${entry}`);
		}
		if (!packedPaths.has(normalizedEntry)) {
			throw new Error(`${pkg.name}: packed tarball is missing declared pi.extensions entry: ${entry}`);
		}
		const source = fs.readFileSync(absoluteEntry, "utf8");
		if (!/export\s+default\b/.test(source)) {
			throw new Error(`${pkg.name}: declared extension entrypoint is missing a default export: ${entry}`);
		}
	}
}

const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oh-pi-pack-"));

try {
	for (const pkg of publishedPackages) {
		console.log(`Packing ${pkg.name}...`);
		const output = execFileSync("pnpm", ["pack", "--json", "--pack-destination", packRoot], {
			cwd: pkg.dir,
			encoding: "utf8",
		});
		const parsedOutput = JSON.parse(output);
		const packResult = Array.isArray(parsedOutput) ? parsedOutput[0] : parsedOutput;
		const manifest = JSON.parse(fs.readFileSync(path.join(pkg.dir, "package.json"), "utf8"));
		verifyExtensionEntrypoints(pkg, manifest, packResult.files ?? []);
	}
} finally {
	fs.rmSync(packRoot, { force: true, recursive: true });
}

console.log("All published packages pack successfully.");
