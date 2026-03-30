import { execFileSync } from "node:child_process";
import { publishedPackages } from "./package-classes.mjs";

for (const pkg of publishedPackages) {
	console.log(`Packing ${pkg.name}...`);
	execFileSync("pnpm", ["pack", "--dry-run"], { cwd: pkg.dir, stdio: "ignore" });
}

console.log("All published packages pack successfully.");
