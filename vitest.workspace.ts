import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
	"vitest.config.ts",
	"packages/analytics-dashboard/vitest.config.ts",
	"packages/pi-remote-tailscale/vitest.config.ts",
	"packages/pi-bash-live-view/vitest.config.ts",
	"packages/pi-pretty/vitest.config.ts",
]);
