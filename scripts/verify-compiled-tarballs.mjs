import { execFileSync } from "node:child_process";

const compiledPackages = [
	{ name: "@ifi/oh-pi-core", dir: "packages/core" },
	{ name: "@ifi/oh-pi-cli", dir: "packages/cli" },
	{ name: "@ifi/pi-web-client", dir: "packages/web-client" },
	{ name: "@ifi/pi-web-server", dir: "packages/web-server" },
];

for (const pkg of compiledPackages) {
	console.log(`Verifying tarball for ${pkg.name}...`);
	execFileSync("pnpm", ["run", "build"], { cwd: pkg.dir, stdio: "ignore" });
	const output = execFileSync("pnpm", ["pack", "--dry-run"], { cwd: pkg.dir, encoding: "utf8" });

	const leakedTestArtifact = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => /(^|\s)dist\/.*\.test\.(?:js|d\.ts|d\.ts\.map|js\.map)$/.test(line));

	if (leakedTestArtifact) {
		throw new Error(`${pkg.name} tarball contains compiled test artifact: ${leakedTestArtifact}`);
	}
}

console.log("Compiled package tarballs do not contain test artifacts.");
