export const INSTALLER_PACKAGES = [
	"@ifi/oh-pi-extensions",
	"@ifi/oh-pi-ant-colony",
	"@ifi/pi-extension-subagents",
	"@ifi/pi-plan",
	"@ifi/pi-spec",
	"@ifi/oh-pi-themes",
	"@ifi/oh-pi-prompts",
	"@ifi/oh-pi-skills",
	"@ifi/pi-web-remote",
];

export const EXPERIMENTAL_PACKAGES = ["@ifi/pi-provider-cursor", "@ifi/pi-provider-ollama"];

export const SWITCHER_PACKAGES = [...INSTALLER_PACKAGES, ...EXPERIMENTAL_PACKAGES];
