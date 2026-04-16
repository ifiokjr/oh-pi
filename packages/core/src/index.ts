export type { AgentPathOptions } from "./agent-paths.js";
export {
	expandHomeDir,
	getExtensionConfigPath,
	getMirroredWorkspacePathSegments,
	getSharedStoragePath,
	resolvePiAgentDir,
} from "./agent-paths.js";
export { getLocale, selectLanguage, setLocale, t } from "./i18n.js";
export type { IconMode, IconName } from "./icons.js";
export { icon, isPlainIcons, setPlainIcons } from "./icons.js";
export { EXTENSIONS, KEYBINDING_SCHEMES, MODEL_CAPABILITIES, PROVIDERS, THEMES } from "./registry.js";
export type {
	DiscoveredModel,
	Locale,
	ModelCapabilities,
	OhPConfig,
	ProviderConfig,
	ProviderSetupStrategy,
} from "./types.js";
export type {
	CreateManagedWorktreeOptions,
	CreateManagedWorktreeResult,
	GitWorktreeEntry,
	ManagedWorktreeMetadata,
	ManagedWorktreeOwner,
	RemoveManagedWorktreeResult,
	RepoWorktreeSnapshot,
	WorktreeRegistry,
} from "./worktree.js";
export {
	buildPaiInstanceId,
	createManagedWorktree,
	createOwnerMetadata,
	formatOwnerLabel,
	formatWorktreeKind,
	getManagedWorktreeParentDir,
	getRepoWorktreeSnapshot,
	getRepoWorktreeStorageRoot,
	getSharedWorktreeRoot,
	getWorktreeRegistryPath,
	loadWorktreeRegistry,
	removeManagedWorktree,
	touchManagedWorktreeSeen,
} from "./worktree.js";
