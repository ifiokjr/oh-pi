/**
<!-- {=repoDefaultInstallerPackagesDocs} -->

Default runtime/content packages installed by `npx @ifi/oh-pi`:

- `@ifi/oh-pi-extensions`
- `@ifi/pi-background-tasks`
- `@ifi/oh-pi-ant-colony`
- `@ifi/pi-diagnostics`
- `@ifi/pi-extension-subagents`
- `@ifi/pi-plan`
- `@ifi/pi-spec`
- `@ifi/pi-web-remote`
- `@ifi/oh-pi-themes`
- `@ifi/oh-pi-prompts`
- `@ifi/oh-pi-skills`

<!-- {/repoDefaultInstallerPackagesDocs} -->
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

/**
<!-- {=repoExperimentalPackagesDocs} -->

Opt-in packages that stay separate from the default installer bundle:

- `@ifi/pi-extension-adaptive-routing`
- `@ifi/pi-provider-catalog`
- `@ifi/pi-provider-cursor`
- `@ifi/pi-provider-ollama`
- `@ifi/pi-bash-live-view`
- `@ifi/pi-pretty`
- `@ifi/pi-remote-tailscale`
- `@ifi/pi-analytics-extension`

<!-- {/repoExperimentalPackagesDocs} -->
*/
export const EXPERIMENTAL_PACKAGES = [
	"@ifi/pi-extension-adaptive-routing",
	"@ifi/pi-provider-catalog",
	"@ifi/pi-provider-cursor",
	"@ifi/pi-provider-ollama",
	"@ifi/pi-bash-live-view",
	"@ifi/pi-pretty",
	"@ifi/pi-remote-tailscale",
	"@ifi/pi-analytics-extension",
];

export const SWITCHER_PACKAGES = [...INSTALLER_PACKAGES, ...EXPERIMENTAL_PACKAGES];
