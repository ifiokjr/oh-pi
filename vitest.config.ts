import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const coreEntry = fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url));
const sharedQnaEntry = fileURLToPath(new URL("./packages/shared-qna/index.ts", import.meta.url));

const coverageInclude = ["scripts/**/*.{ts,mts,mjs}", "packages/**/*.{ts,tsx,mts,mjs}"];
const coverageExclude = [
	"**/*.d.ts",
	"**/*.test.*",
	"**/tests/**",
	"**/dist/**",
	"**/node_modules/**",
	"**/vitest*.config.*",
	"packages/cursor/proto/**",
	"packages/providers/supported-providers.generated.ts",
];

export default defineConfig({
	resolve: {
		alias: {
			"@ifi/oh-pi-core": coreEntry,
			"@ifi/pi-shared-qna": sharedQnaEntry,
		},
	},
	test: {
		include: [
			"benchmarks/**/*.test.ts",
			"scripts/**/*.test.ts",
			"packages/core/src/**/*.test.ts",
			"packages/cli/src/**/*.test.ts",
			"packages/extensions/extensions/**/*.test.ts",
			"packages/ant-colony/tests/**/*.test.ts",
			"packages/subagents/tests/**/*.test.ts",
			"packages/plan/tests/**/*.test.ts",
			"packages/shared-qna/tests/**/*.test.ts",
			"packages/spec/tests/**/*.test.ts",
			"packages/cursor/tests/**/*.test.ts",
			"packages/ollama/tests/**/*.test.ts",
			"packages/providers/tests/**/*.test.ts",
			"packages/web-server/tests/**/*.test.ts",
			"packages/web-client/tests/**/*.test.ts",
			"packages/web-remote/tests/**/*.test.ts",
		],
		coverage: {
			provider: "v8",
			all: true,
			include: coverageInclude,
			exclude: coverageExclude,
			reporter: ["text", "html", "json-summary", "lcovonly"],
			reportsDirectory: "./coverage",
		},
	},
});
