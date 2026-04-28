import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = import.meta.dirname;

export default defineConfig({
	plugins: [tailwindcss(), react()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	test: {
		coverage: {
			exclude: [
				"node_modules/",
				"src/tests/",
				"**/*.d.ts",
				"e2e/",
				"src/vite-env.d.ts",
				"src/App.tsx",
				"src/main.tsx",
				"src/components/**",
				"src/pages/**",
				"src/hooks/useAnalytics.ts",
				"src/server/**",
			],
			include: ["src/**/*.{ts,tsx}"],
			provider: "v8",
			reporter: ["text", "json", "html", "lcov"],
		},
		environment: "jsdom",
		exclude: ["e2e/**", "node_modules/**"],
		globals: true,
		pool: "forks",

		setupFiles: ["./src/tests/setup.ts"],
	},
});
