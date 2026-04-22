import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			"@ifi/pi-pretty": packageRoot,
		},
	},
	test: {
		include: ["**/*.test.ts"],
		exclude: ["dist/**", "node_modules/**"],
		coverage: {
			provider: "v8",
			all: true,
			include: ["index.ts", "src/**/*.ts"],
			reporter: ["text", "html", "json-summary", "lcovonly"],
			reportsDirectory: "./coverage",
		},
	},
});