#!/usr/bin/env node
/**
 * Oh-pi CLI Entry Point
 *
 * Handles Windows terminal UTF-8 encoding setup, then launches the main
 * configuration wizard. Windows terminals default to non-UTF-8 codepages
 * (e.g. GBK/CP936), which garble emoji and Unicode output.
 */
import { execSync } from "node:child_process";

if (process.platform === "win32") {
	try {
		execSync("chcp 65001", { stdio: "ignore" });
	} catch {
		// Chcp not available — best effort
	}
}

import { run } from "../index.js";
import { parseArgs } from "../utils/args.js";

const args = parseArgs(process.argv.slice(2));
run(args).catch((error) => {
	console.error(error);
	process.exit(1);
});
