export type {
	Locale,
	ProviderSetupStrategy,
	DiscoveredModel,
	ProviderConfig,
	OhPConfig,
	ModelCapabilities,
} from "./types.js";
export { MODEL_CAPABILITIES, PROVIDERS, THEMES, EXTENSIONS, KEYBINDING_SCHEMES } from "./registry.js";
export { t, setLocale, getLocale, selectLanguage } from "./i18n.js";
