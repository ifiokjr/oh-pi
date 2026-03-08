#!/usr/bin/env node
/**
 * oh-pi CLI Entry Point
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
		// chcp not available — best effort
	}
}

import { run } from "../index.js";
run().catch((e) => {
	console.error(e);
	process.exit(1);
});
