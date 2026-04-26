import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;
const webServerEntry = resolve(rootDir, "../web-server/src/index.ts");

export default defineConfig({
	resolve: {
		alias: {
			"@ifi/pi-web-server": webServerEntry,
		},
	},
	root: rootDir,
	test: {
		globals: true,
		coverage: {
			all: true,
			exclude: ["tests/**/*.test.ts"],
			include: ["index.ts", "src/**/*.ts"],
			provider: "v8",
			reporter: ["text", "json-summary", "html"],
			thresholds: {
				branches: 100,
				functions: 100,
				lines: 100,
				statements: 100,
			},
		},
		include: ["tests/**/*.test.ts"],
		pool: "forks",
	},
});
