/**
<!-- {=repoDefaultInstallerPackagesDocs} -->

Default runtime/content packages installed by `npx @monopi/monopi`:

- `@monopi/extension-answer`
- `@monopi/extension-watchdog`
- `@monopi/extension-btw`
- `@monopi/extension-compact-header`
- `@monopi/extension-custom-footer`
- `@monopi/extension-external-editor`
- `@monopi/extension-git-guard`
- `@monopi/extension-scheduler`
- `@monopi/extension-shell-format`
- `@monopi/extension-tool-metadata`
- `@monopi/extension-usage-tracker`
- `@monopi/extension-worktree`
- `@monopi/background-tasks`
- `@monopi/diagnostics`
- `@monopi/subagents`
- `@monopi/web-remote`
- `@monopi/skills`

<!-- {/repoDefaultInstallerPackagesDocs} -->
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

/**
<!-- {=repoExperimentalPackagesDocs} -->

Opt-in packages that stay separate from the default installer bundle:

- `@monopi/extension-bg-process`
- `@monopi/adaptive-routing`
- `@monopi/provider-catalog`
- `@monopi/provider-cursor`
- `@monopi/provider-ollama`
- `@monopi/bash-live-view`
- `@monopi/pretty`
- `@monopi/remote-tailscale`
- `@monopi/analytics-extension`

<!-- {/repoExperimentalPackagesDocs} -->
*/
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
