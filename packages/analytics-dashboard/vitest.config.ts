import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    pool: "forks",
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
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
    },
  },
});