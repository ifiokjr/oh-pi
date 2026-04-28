import { requirePiTuiModule } from "@ifi/pi-shared-qna";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { resolveActivePlanFilePath } from "./plan-files";
import type { PlanModeState } from "./types";
import { createInactivePlanModeState, isPlanModeState } from "./utils";

function getPiTui() {
	return requirePiTuiModule() as {
		truncateToWidth: (text: string, width: number) => string;
		wrapTextWithAnsi: (text: string, width: number) => string[];
	};
}

export const STATE_ENTRY_TYPE = "pi-plan:state";
export const CONTEXT_ENTRY_TYPE = "pi-plan:context";
const BANNER_WIDGET_KEY = "pi-plan-banner";
const PLAN_MODE_TOOL_NAMES = ["task_agents", "steer_task_agent", "request_user_input", "set_plan"] as const;
const PLAN_MODE_TOOL_NAME_SET = new Set<string>(PLAN_MODE_TOOL_NAMES);

export function getLatestState(ctx: ExtensionContext): PlanModeState {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE) {
			continue;
		}
		if (isPlanModeState(entry.data)) {
			return entry.data;
		}
	}
	return createInactivePlanModeState();
}

export function hasEntryInSession(ctx: ExtensionContext, entryId: string | undefined): boolean {
	if (!entryId) {
		return false;
	}
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.id === entryId) {
			return true;
		}
	}
	return false;
}

export function getFirstUserMessageId(ctx: ExtensionContext): string | undefined {
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type === "message" && entry.message.role === "user") {
			return entry.id;
		}
	}
	return undefined;
}

export function createPlanModeStateManager(pi: ExtensionAPI) {
	let state: PlanModeState = createInactivePlanModeState();

	const persistState = () => {
		pi.appendEntry(STATE_ENTRY_TYPE, state);
	};

	const areSameToolLists = (left: string[], right: string[]) => {
		if (left.length !== right.length) {
			return false;
		}
		for (let i = 0; i < left.length; i++) {
			if (left[i] !== right[i]) {
				return false;
			}
		}
		return true;
	};

	const syncPlanModeTools = () => {
		const activeTools = pi.getActiveTools();
		const nextTools = state.active
			? [...activeTools, ...PLAN_MODE_TOOL_NAMES.filter((toolName) => !activeTools.includes(toolName))]
			: activeTools.filter((toolName) => !PLAN_MODE_TOOL_NAME_SET.has(toolName));

		if (areSameToolLists(activeTools, nextTools)) {
			return;
		}

		pi.setActiveTools(nextTools);
	};

	const applyBanner = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) {
			return;
		}

		if (!state.active) {
			ctx.ui.setWidget(BANNER_WIDGET_KEY, undefined, {
				placement: "aboveEditor",
			});
			return;
		}

		ctx.ui.setWidget(
			BANNER_WIDGET_KEY,
			(_tui, theme) => ({
				invalidate: () => {},
				render: (width: number) => {
					const { truncateToWidth, wrapTextWithAnsi } = getPiTui();
					const safeWidth = Math.max(1, width);
					const activePlanFilePath = resolveActivePlanFilePath(ctx, state.planFilePath);
					const lines = [
						truncateToWidth(
							`${theme.fg("warning", theme.bold(" Plan mode active"))}${theme.fg(
								"muted",
								"; `/plan` to exit. `/plan <location>` to move plan file.",
							)}`,
							safeWidth,
						),
						...wrapTextWithAnsi(theme.fg("dim", ` Plan file: ${activePlanFilePath}`), safeWidth),
					];
					return lines;
				},
			}),
			{ placement: "aboveEditor" },
		);
	};

	const setState = (ctx: ExtensionContext, nextState: PlanModeState) => {
		state = nextState;
		persistState();
		syncPlanModeTools();
		applyBanner(ctx);
	};

	const startPlanMode = (
		ctx: ExtensionContext,
		options: {
			originLeafId?: string;
			planFilePath: string;
		},
	) => {
		setState(ctx, {
			active: true,
			lastPlanLeafId: state.lastPlanLeafId,
			originLeafId: options.originLeafId,
			planFilePath: options.planFilePath,
			version: state.version,
		});
	};

	const refresh = (ctx: ExtensionContext) => {
		state = getLatestState(ctx);
		syncPlanModeTools();
		applyBanner(ctx);
	};

	return {
		applyBanner,
		getState: () => state,
		refresh,
		setState,
		startPlanMode,
		syncTools: syncPlanModeTools,
	};
}
