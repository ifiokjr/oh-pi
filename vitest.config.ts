import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		include: [
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
			"packages/web-server/tests/**/*.test.ts",
			"packages/web-client/tests/**/*.test.ts",
			"packages/web-remote/tests/**/*.test.ts",
		],
	},
});
