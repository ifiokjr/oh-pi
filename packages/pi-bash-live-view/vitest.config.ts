import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			exclude: ["tests/**", "src/**/*.d.ts"],
			include: ["index.ts", "src/**/*.ts"],
			provider: "v8",
			reporter: ["text", "json", "lcov"],
			thresholds: {
				branches: 100,
				functions: 100,
				lines: 100,
				statements: 100,
			},
		},
		include: ["tests/**/*.test.ts"],
	},
});
