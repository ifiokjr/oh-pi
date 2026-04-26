import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = import.meta.dirname;

export default defineConfig({
	resolve: {
		alias: {
			"@ifi/pi-pretty": packageRoot,
		},
	},
	test: {
		coverage: {
			all: true,
			include: ["index.ts", "src/**/*.ts"],
			provider: "v8",
			reporter: ["text", "html", "json-summary", "lcovonly"],
			reportsDirectory: "./coverage",
		},
		exclude: ["dist/**", "node_modules/**"],
		include: ["**/*.test.ts"],
	},
});
