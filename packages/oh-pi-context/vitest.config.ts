import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = import.meta.dirname;

export default defineConfig({
	resolve: {
		alias: {
			"@ifi/oh-pi-context": packageRoot,
		},
	},
	test: {
		globals: true,
		coverage: {
			include: ["src/**/*.ts"],
			provider: "v8",
			reporter: ["text", "html", "json-summary", "lcovonly"],
			reportsDirectory: "./coverage",
		},
		exclude: ["dist/**", "node_modules/**"],
		include: ["**/*.test.ts"],
	},
});
