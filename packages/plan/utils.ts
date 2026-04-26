import path from "node:path";
import type { PlanModeState } from "./types";

export const PLAN_MODE_STATE_VERSION = 1;

export type { PlanModeState };

export const PLAN_MODE_START_OPTIONS = ["Empty branch", "Current branch"] as const;
export const PLAN_MODE_END_OPTIONS = ["Exit", "Exit & summarize branch"] as const;

export const PLAN_MODE_SUMMARY_PROMPT = `We are switching from a planning branch back to implementation work.
Summarize this planning branch so implementation can begin immediately.

Include:
1. Goal and scope
2. Key decisions and assumptions
3. Ordered implementation steps
4. Risks, validations, and open questions
5. Important file paths, commands, and references gathered during planning

Use concise bullet points and preserve exact technical identifiers when relevant.`;

export function createInactivePlanModeState(): PlanModeState {
	return {
		active: false,
		version: PLAN_MODE_STATE_VERSION,
	};
}

export function isPlanModeState(value: unknown): value is PlanModeState {
	if (!value || typeof value !== "object") {
		return false;
	}

	const state = value as Partial<PlanModeState>;
	return state.version === PLAN_MODE_STATE_VERSION && typeof state.active === "boolean";
}

export function resolvePlanFilePath(cwd: string, filePath: string): string | null {
	const trimmed = filePath.trim();
	if (!trimmed) {
		return null;
	}
	return path.resolve(cwd, trimmed);
}

export function resolveTaskAgentConcurrency(concurrency: number | undefined = 2): number | null {
	if (!Number.isFinite(concurrency) || !Number.isInteger(concurrency)) {
		return null;
	}
	if (concurrency < 1 || concurrency > 4) {
		return null;
	}
	return concurrency;
}

export function findDuplicateId(ids: string[]): string | null {
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) {
			return id;
		}
		seen.add(id);
	}
	return null;
}

export function buildImplementationPrefill(planPath?: string): string {
	if (planPath) {
		return `Plan file: ${planPath}\nImplement the approved plan in this file. Keep changes focused, update tests, and summarize what was implemented.`;
	}
	return "Implement the approved plan step by step. Keep changes focused, update tests, and summarize what was implemented.";
}
