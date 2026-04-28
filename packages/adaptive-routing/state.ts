import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
		const parsed = JSON.parse(readFileSync(path, "utf8")) as AdaptiveRoutingState;
		return parsed && typeof parsed === "object" ? parsed : { ...DEFAULT_STATE };
	} catch {
		return { ...DEFAULT_STATE };
	}
}

let pendingState: AdaptiveRoutingState | undefined;
let stateSaveTimer: ReturnType<typeof setTimeout> | null = null;
const STATE_PERSIST_DEBOUNCE_MS = 2000;

function scheduleStateSave(path: string): void {
	if (stateSaveTimer) {
		return;
	}
	stateSaveTimer = setTimeout(() => {
		stateSaveTimer = null;
		if (pendingState) {
			const stateToWrite = pendingState;
			pendingState = undefined;
			try {
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, `${JSON.stringify(stateToWrite, null, 2)}\n`, "utf8");
			} catch {
				// Non-critical persistence only.
			}
		}
	}, STATE_PERSIST_DEBOUNCE_MS);
	stateSaveTimer.unref?.();
}

export function writeAdaptiveRoutingState(state: AdaptiveRoutingState): void {
	const path = getAdaptiveRoutingStatePath();
	pendingState = state;
	scheduleStateSave(path);
}
