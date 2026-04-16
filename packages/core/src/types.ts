/** Supported UI locales for the oh-pi configurator. */
export type Locale = "en" | "fr";
export type ProviderSetupStrategy = "keep" | "replace" | "add";

/** Model info discovered at runtime from a provider's API. */
export interface DiscoveredModel {
	id: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	contextWindow: number;
	maxTokens: number;
}

/** Configuration for a single LLM provider (API key, endpoint, model selection). */
export interface ProviderConfig {
	/** Provider identifier (e.g. "anthropic", "openai"). */
	name: string;
	/** API key for authentication. */
	apiKey: string;
	/** Default model ID to use with this provider. */
	defaultModel?: string;
	/** Custom API base URL (for self-hosted or proxy endpoints). */
	baseUrl?: string;
	/** Detected API type (e.g. "openai-completions", "openai-responses"). */
	api?: string;
	/** All models discovered from the provider's API. */
	discoveredModels?: DiscoveredModel[];
	/** Context window size in tokens (for custom providers). */
	contextWindow?: number;
	/** Maximum output tokens (for custom providers). */
	maxTokens?: number;
	/** Whether the model supports reasoning/chain-of-thought. */
	reasoning?: boolean;
	/** Whether the model supports multimodal input (images). */
	multimodal?: boolean;
}

/** Complete oh-pi configuration — produced by the TUI wizard and applied to ~/.pi/agent/. */
export interface OhPConfig {
	/** Configured LLM providers. */
	providers: ProviderConfig[];
	/** Strategy for existing provider config: keep, replace, or add. */
	providerStrategy?: ProviderSetupStrategy;
	/** Theme name (matches a file in pi-package/themes/). */
	theme: string;
	/** Keybinding scheme: "default", "vim", or "emacs". */
	keybindings: string;
	/** List of enabled extension names. */
	extensions: string[];
	/** List of enabled prompt template names. */
	prompts: string[];
	/** AGENTS.md template name (e.g. "general-developer"). */
	agents: string;
	/** Thinking level: "off", "low", "medium", or "high". */
	thinking: string;
	/** UI locale for generated content. */
	locale?: string;
	/** Context compaction threshold (0-1, proportion of context window; default 0.75). */
	compactThreshold?: number;
}

/** Known model capability parameters. */
export interface ModelCapabilities {
	/** Maximum context window size in tokens. */
	contextWindow: number;
	/** Maximum output tokens per response. */
	maxTokens: number;
	/** Whether the model supports reasoning/chain-of-thought. */
	reasoning: boolean;
	/** Supported input modalities. */
	input: ("text" | "image")[];
}
