import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const coreEntry = fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url));
const sharedQnaEntry = fileURLToPath(new URL("./packages/shared-qna/index.ts", import.meta.url));
const webServerEntry = fileURLToPath(new URL("./packages/web-server/src/index.ts", import.meta.url));

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
	// Analytics files that remain intentionally file-ignored and are covered via E2E or runtime-only paths
	"packages/analytics-dashboard/playwright.config.ts",
	"packages/analytics-dashboard/vite.config.ts",
	"packages/analytics-dashboard/src/App.tsx",
	"packages/analytics-dashboard/src/main.tsx",
	"packages/analytics-dashboard/src/components/**",
	"packages/analytics-dashboard/src/pages/**",
	"packages/analytics-dashboard/src/hooks/useAnalytics.ts",
	"packages/analytics-dashboard/src/server/**",
	"packages/analytics-db/drizzle.config.ts",
	"packages/analytics-db/src/db.ts",
	"packages/analytics-db/src/index.ts",
	"packages/analytics-db/src/migrations.ts",
	"packages/analytics-extension/index.ts",
];

export default defineConfig({
	resolve: {
		alias: {
			"@ifi/oh-pi-core": coreEntry,
			"@ifi/pi-shared-qna": sharedQnaEntry,
			"@ifi/pi-web-server": webServerEntry,
		},
	},
	test: {
		pool: "forks",
		include: [
			"benchmarks/**/*.test.ts",
			"scripts/**/*.test.ts",
			"packages/core/src/**/*.test.ts",
			"packages/adaptive-routing/**/*.test.ts",
			"packages/background-tasks/tests/**/*.test.ts",
			"packages/cli/src/**/*.test.ts",
			"packages/diagnostics/tests/**/*.test.ts",
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
			"packages/analytics-db/src/tests/**/*.test.ts",
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