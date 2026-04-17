/**
 * Runtime-compatible package list for the oh-pi installer.
 *
 * Keep this file in sync with ./package-list.mts. The TypeScript source remains the canonical
 * authoring surface for repo tooling, while this `.mjs` bridge preserves direct Node execution for
 * `packages/oh-pi/bin/oh-pi.mjs` on Node 20.
 */
export const INSTALLER_PACKAGES = [
	"@ifi/oh-pi-extensions",
	"@ifi/pi-background-tasks",
	"@ifi/oh-pi-ant-colony",
	"@ifi/pi-diagnostics",
	"@ifi/pi-extension-subagents",
	"@ifi/pi-plan",
	"@ifi/pi-spec",
	"@ifi/oh-pi-themes",
	"@ifi/oh-pi-prompts",
	"@ifi/oh-pi-skills",
	"@ifi/pi-web-remote",
];

export const EXPERIMENTAL_PACKAGES = [
	"@ifi/pi-extension-adaptive-routing",
	"@ifi/pi-provider-catalog",
	"@ifi/pi-provider-cursor",
	"@ifi/pi-provider-ollama",
];

export const SWITCHER_PACKAGES = [...INSTALLER_PACKAGES, ...EXPERIMENTAL_PACKAGES];
