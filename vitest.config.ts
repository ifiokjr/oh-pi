import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const coreEntry = fileURLToPath(new URL("packages/monopi__core/src/index.ts", import.meta.url));
const sharedQnaEntry = fileURLToPath(new URL("packages/monopi__shared-qna/index.ts", import.meta.url));
const webServerEntry = fileURLToPath(new URL("packages/monopi__web-server/src/index.ts", import.meta.url));

const coverageInclude = ["scripts/**/*.{ts,mts,mjs}", "packages/**/*.{ts,tsx,mts,mjs}"];
const coverageExclude = [
	"**/*.d.ts",
	"**/*.test.*",
	"**/tests/**",
	"**/dist/**",
	"**/node_modules/**",
	"**/vitest*.config.*",
	"packages/monopi__provider-cursor/proto/**",
	"packages/monopi__provider-catalog/supported-providers.generated.ts",
	// Analytics files that remain intentionally file-ignored and are covered via E2E or runtime-only paths
	"packages/monopi__analytics-dashboard/playwright.config.ts",
	"packages/monopi__analytics-dashboard/vite.config.ts",
	"packages/monopi__analytics-dashboard/src/App.tsx",
	"packages/monopi__analytics-dashboard/src/main.tsx",
	"packages/monopi__analytics-dashboard/src/components/**",
	"packages/monopi__analytics-dashboard/src/pages/**",
	"packages/monopi__analytics-dashboard/src/hooks/useAnalytics.ts",
	"packages/monopi__analytics-dashboard/src/server/**",
	"packages/monopi__analytics-db/drizzle.config.ts",
	"packages/monopi__analytics-db/src/db.ts",
	"packages/monopi__analytics-db/src/index.ts",
	"packages/monopi__analytics-db/src/migrations.ts",
	"packages/monopi__analytics-extension/index.ts",
	// Docs site — no tests needed for a static documentation site
	"packages/monopi__docs/vite.config.ts",
	"packages/monopi__docs/src/**/*.tsx",
	"packages/monopi__docs/src/**/*.ts",
	"packages/monopi__docs/scripts/*",
];

export default defineConfig({
	resolve: {
		alias: {
			"@monopi/core": coreEntry,
			"@monopi/shared-qna": sharedQnaEntry,
			"@monopi/web-server": webServerEntry,
		},
	},
	test: {
		globals: true,
		coverage: {
			all: true,
			exclude: coverageExclude,
			include: coverageInclude,
			provider: "v8",
			reporter: ["text", "html", "json-summary", "lcovonly"],
			reportsDirectory: "./coverage",
		},
		include: [
			"benchmarks/**/*.test.ts",
			"scripts/**/*.test.ts",
			"packages/monopi__core/src/**/*.test.ts",
			"packages/monopi__adaptive-routing/**/*.test.ts",
			"packages/monopi__background-tasks/tests/**/*.test.ts",
			"packages/monopi__cli/src/**/*.test.ts",
			"packages/monopi__diagnostics/tests/**/*.test.ts",
			"packages/monopi__db/tests/**/*.test.ts",
			"packages/monopi__extension-*/tests/**/*.test.ts",
			"packages/monopi__subagents/tests/**/*.test.ts",
			"packages/monopi__shared-qna/tests/**/*.test.ts",
			"packages/monopi__provider-cursor/tests/**/*.test.ts",
			"packages/monopi__provider-ollama/tests/**/*.test.ts",
			"packages/monopi__provider-catalog/tests/**/*.test.ts",
			"packages/monopi__web-server/tests/**/*.test.ts",
			"packages/monopi__web-client/tests/**/*.test.ts",
			"packages/monopi__web-remote/tests/**/*.test.ts",
			"packages/monopi__analytics-db/src/tests/**/*.test.ts",
			"packages/monopi__remote-tailscale/tests/**/*.test.ts",
			"packages/monopi__bash-live-view/tests/**/*.test.ts",
			"packages/monopi__pretty/tests/**/*.test.ts",
		],
		pool: "forks",
	},
});
