import { execFileSync } from "node:child_process";
import { compiledPackages } from "./package-classes.mjs";

for (const pkg of compiledPackages) {
	console.log(`Verifying tarball for ${pkg.name}...`);
	execFileSync("pnpm", ["run", "build"], { cwd: pkg.dir, stdio: "ignore" });
	const output = execFileSync("pnpm", ["pack", "--dry-run"], {
		cwd: pkg.dir,
		encoding: "utf8",
	});

	const leakedTestArtifact = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => /(^|\s)dist\/.*\.test\.(?:js|d\.ts|d\.ts\.map|js\.map)$/.test(line));

	if (leakedTestArtifact) {
		throw new Error(`${pkg.name} tarball contains compiled test artifact: ${leakedTestArtifact}`);
	}
}

console.log("Compiled package tarballs do not contain test artifacts.");
