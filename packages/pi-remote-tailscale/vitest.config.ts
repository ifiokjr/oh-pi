import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const webServerEntry = resolve(rootDir, "../web-server/src/index.ts");

export default defineConfig({
	root: rootDir,
	resolve: {
		alias: {
			"@ifi/pi-web-server": webServerEntry,
		},
	},
	test: {
		pool: "forks",
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			all: true,
			include: ["index.ts", "src/**/*.ts"],
			exclude: ["tests/**/*.test.ts"],
			reporter: ["text", "json-summary", "html"],
			thresholds: {
				statements: 100,
				branches: 100,
				functions: 100,
				lines: 100,
			},
		},
	},
});
