/**
 * Runtime-compatible package list for the monopi installer.
 *
 * Keep this file in sync with ./package-list.mts. The TypeScript source remains the canonical
 * authoring surface for repo tooling, while this `.mjs` bridge preserves direct Node execution for
 * `packages/monopi__monopi/bin/monopi.mjs` on Node 20.
 */
export const INSTALLER_PACKAGES = [
	"@monopi/extension-answer",
	"@monopi/extension-watchdog",
	"@monopi/extension-btw",
	"@monopi/extension-compact-header",
	"@monopi/extension-custom-footer",
	"@monopi/extension-external-editor",
	"@monopi/extension-git-guard",
	"@monopi/extension-scheduler",
	"@monopi/extension-shell-format",
	"@monopi/extension-tool-metadata",
	"@monopi/extension-usage-tracker",
	"@monopi/extension-worktree",
	"@monopi/background-tasks",
	"@monopi/diagnostics",
	"@monopi/subagents",
	"@monopi/skills",
	"@monopi/web-remote",
];

export const EXPERIMENTAL_PACKAGES = [
	"@monopi/extension-bg-process",
	"@monopi/adaptive-routing",
	"@monopi/provider-catalog",
	"@monopi/provider-cursor",
	"@monopi/provider-ollama",
	"@monopi/bash-live-view",
	"@monopi/pretty",
	"@monopi/remote-tailscale",
	"@monopi/analytics-extension",
];

export const SWITCHER_PACKAGES = [...INSTALLER_PACKAGES, ...EXPERIMENTAL_PACKAGES];
