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
export type {
	DelegatedAvailableModel,
	DelegatedSelectionLatencySnapshot,
	DelegatedSelectionPolicy,
	DelegatedSelectionRankedCandidate,
	DelegatedSelectionResult,
	DelegatedSelectionUsageSnapshot,
	ModelIntelligenceRuntimeModel,
	ModelIntelligenceRuntimeSnapshot,
	ModelIntelligenceTaskScore,
	ModelTaskProfile,
	ProviderUsageConfidence,
	TaskSizeTier,
} from "./model-intelligence.js";
export {
	findModelIntelligence,
	getModelIntelligenceSnapshot,
	mergeDelegatedSelectionPolicies,
	selectDelegatedModel,
} from "./model-intelligence.js";
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
	RepoWorktreeContext,
	RepoWorktreeSnapshot,
	WorktreeRegistry,
} from "./worktree.js";
export {
	buildPaiInstanceId,
	clearRepoWorktreeSnapshotCache,
	createManagedWorktree,
	createOwnerMetadata,
	formatOwnerLabel,
	formatWorktreeKind,
	getCachedRepoWorktreeContext,
	getCachedRepoWorktreeSnapshot,
	getManagedWorktreeParentDir,
	getRepoWorktreeContext,
	getRepoWorktreeSnapshot,
	getRepoWorktreeStorageRoot,
	getSharedWorktreeRoot,
	getWorktreeRegistryPath,
	loadWorktreeRegistry,
	refreshRepoWorktreeContext,
	refreshRepoWorktreeSnapshot,
	removeManagedWorktree,
	saveWorktreeRegistry,
	touchManagedWorktreeSeen,
} from "./worktree.js";
