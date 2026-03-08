import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		include: [
			"packages/core/src/**/*.test.ts",
			"packages/cli/src/**/*.test.ts",
			"packages/extensions/extensions/**/*.test.ts",
			"packages/ant-colony/tests/**/*.test.ts",
		],
	},
});
