import type { OhPConfig } from "@ifi/oh-pi-core";

export type AdaptiveRoutingModeConfig = "off" | "shadow" | "auto";

export interface AdaptiveRoutingSetupConfig {
	mode: AdaptiveRoutingModeConfig;
	categories: Record<string, string[]>;
}

export type OhPConfigWithRouting = OhPConfig & {
	adaptiveRouting?: AdaptiveRoutingSetupConfig;
};
