import path from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

export function resolveAgentDir(): string {
	return getAgentDir();
}

export function getSubagentConfigPath(): string {
	return path.join(resolveAgentDir(), "extensions", "subagent", "config.json");
}

export function getUserAgentsDir(): string {
	return path.join(resolveAgentDir(), "agents");
}

export function getSessionsBaseDir(): string {
	return path.join(resolveAgentDir(), "sessions");
}

export function getRunHistoryPath(): string {
	return path.join(resolveAgentDir(), "run-history.jsonl");
}
