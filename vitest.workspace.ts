import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
	// Main monorepo tests (Node.js environment)
	"vitest.config.ts",
	// Analytics dashboard tests (jsdom + React environment)
	"packages/analytics-dashboard/vitest.config.ts",
]);