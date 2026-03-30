export const compiledPackages = [
	{ name: "@ifi/oh-pi-core", dir: "packages/core" },
	{ name: "@ifi/oh-pi-cli", dir: "packages/cli" },
	{ name: "@ifi/pi-web-client", dir: "packages/web-client" },
	{ name: "@ifi/pi-web-server", dir: "packages/web-server" },
];

export const publishedPackages = [
	...compiledPackages,
	{ name: "@ifi/oh-pi-extensions", dir: "packages/extensions" },
	{ name: "@ifi/oh-pi-ant-colony", dir: "packages/ant-colony" },
	{ name: "@ifi/oh-pi-themes", dir: "packages/themes" },
	{ name: "@ifi/oh-pi-prompts", dir: "packages/prompts" },
	{ name: "@ifi/oh-pi-skills", dir: "packages/skills" },
	{ name: "@ifi/oh-pi-agents", dir: "packages/agents" },
	{ name: "@ifi/pi-extension-subagents", dir: "packages/subagents" },
	{ name: "@ifi/pi-shared-qna", dir: "packages/shared-qna" },
	{ name: "@ifi/pi-plan", dir: "packages/plan" },
	{ name: "@ifi/pi-spec", dir: "packages/spec" },
	{ name: "@ifi/pi-web-remote", dir: "packages/web-remote" },
	{ name: "@ifi/oh-pi", dir: "packages/oh-pi" },
];
