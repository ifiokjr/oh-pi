import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { AdaptiveRoutingState } from "./types.js";

const DEFAULT_STATE: AdaptiveRoutingState = {};

export function getAdaptiveRoutingStatePath(): string {
	return join(getAgentDir(), "extensions", "adaptive-routing", "state.json");
}

export function readAdaptiveRoutingState(): AdaptiveRoutingState {
	const path = getAdaptiveRoutingStatePath();
	try {
		if (!existsSync(path)) {
			return { ...DEFAULT_STATE };
		}
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as AdaptiveRoutingState;
		return parsed && typeof parsed === "object" ? parsed : { ...DEFAULT_STATE };
	} catch {
		return { ...DEFAULT_STATE };
	}
}

export function writeAdaptiveRoutingState(state: AdaptiveRoutingState): void {
	const path = getAdaptiveRoutingStatePath();
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
	} catch {
		// Non-critical persistence only.
	}
}
