const DEFAULT_WIDGET_KEY_PREFIX = "pi-bash-live-view";
const DEFAULT_WIDGET_MAX_LINES = 12;
const DEFAULT_RENDER_DEBOUNCE_MS = 120;
const ELAPSED_TICK_MS = 1000;

export type WidgetStatus = "running" | "completed" | "failed" | "cancelled" | "timed_out";

export interface WidgetState {
	command: string;
	startedAt: number;
	ansiLines: string[];
	status: WidgetStatus;
	exitCode: number | null;
}

export interface WidgetThemeLike {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

export interface WidgetTuiLike {
	requestRender: () => void;
}

export interface WidgetContextLike {
	hasUI?: boolean;
	ui?: {
		setWidget: (...args: any[]) => void;
	};
}

export interface PtyLiveWidgetOptions {
	key?: string;
	maxLines?: number;
	placement?: "aboveEditor" | "belowEditor";
	renderDebounceMs?: number;
}

function truncateCommand(command: string, maxLength = 96): string {
	if (command.length <= maxLength) {
		return command;
	}

	return `${command.slice(0, maxLength - 1)}…`;
}

function toStatusColor(status: WidgetStatus): string {
	switch (status) {
		case "completed": {
			return "success";
		}
		case "failed": {
			return "error";
		}
		case "cancelled":
		case "timed_out": {
			return "warning";
		}
		default: {
			return "accent";
		}
	}
}

function toStatusLabel(status: WidgetStatus): string {
	switch (status) {
		case "timed_out": {
			return "timed out";
		}
		default: {
			return status;
		}
	}
}

export function formatElapsedMmSs(elapsedMs: number): string {
	const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildWidgetLines(
	theme: WidgetThemeLike,
	state: WidgetState,
	options: Pick<PtyLiveWidgetOptions, "maxLines"> = {},
	now = Date.now(),
): string[] {
	const maxLines = options.maxLines ?? DEFAULT_WIDGET_MAX_LINES;
	const statusColor = toStatusColor(state.status);
	const header = `${theme.fg("accent", theme.bold("🖥 Bash PTY"))} ${theme.fg(statusColor, toStatusLabel(state.status))} · ${formatElapsedMmSs(now - state.startedAt)}`;
	const commandLine = theme.fg("dim", truncateCommand(state.command));
	const bodyLines = state.ansiLines.length > maxLines ? state.ansiLines.slice(-maxLines) : state.ansiLines;

	if (bodyLines.length === 0) {
		return [header, commandLine, theme.fg("dim", "(waiting for output)")];
	}

	return [header, commandLine, ...bodyLines];
}

export class PtyLiveWidgetController {
	private readonly key: string;
	private readonly maxLines: number;
	private readonly placement: "aboveEditor" | "belowEditor";
	private readonly renderDebounceMs: number;
	private state: WidgetState | null = null;
	private requestRender: (() => void) | null = null;
	private stopElapsedTimer: (() => void) | null = null;
	private renderTimer: ReturnType<typeof setTimeout> | null = null;
	private mounted = false;

	constructor(
		private readonly ctx: WidgetContextLike | undefined,
		options: PtyLiveWidgetOptions = {},
	) {
		this.key = options.key ?? `${DEFAULT_WIDGET_KEY_PREFIX}:${Math.random().toString(36).slice(2, 8)}`;
		this.maxLines = options.maxLines ?? DEFAULT_WIDGET_MAX_LINES;
		this.placement = options.placement ?? "belowEditor";
		this.renderDebounceMs = Math.max(
			DEFAULT_RENDER_DEBOUNCE_MS,
			options.renderDebounceMs ?? DEFAULT_RENDER_DEBOUNCE_MS,
		);
	}

	private mount(): void {
		if (this.mounted || !this.ctx?.hasUI || !this.ctx.ui) {
			return;
		}

		this.mounted = true;
		this.ctx.ui.setWidget(
			this.key,
			(tui: WidgetTuiLike, theme: WidgetThemeLike) => {
				this.requestRender = () => tui.requestRender();
				this.scheduleRender();
				let elapsedTimer: ReturnType<typeof setInterval> | null = null;

				const stopElapsedTimer = () => {
					if (!elapsedTimer) {
						return;
					}
					clearInterval(elapsedTimer);
					elapsedTimer = null;
				};
				this.stopElapsedTimer = stopElapsedTimer;

				const syncElapsedTimer = () => {
					if (this.state?.status !== "running") {
						stopElapsedTimer();
						return;
					}

					if (elapsedTimer) {
						return;
					}

					elapsedTimer = setInterval(() => tui.requestRender(), ELAPSED_TICK_MS);
					elapsedTimer.unref?.();
				};

				return {
					dispose: () => {
						stopElapsedTimer();
						if (this.stopElapsedTimer === stopElapsedTimer) {
							this.stopElapsedTimer = null;
						}
						if (this.requestRender) {
							this.requestRender = null;
						}
					},
					invalidate: () => {},
					render: () => {
						syncElapsedTimer();
						if (!this.state) {
							return [];
						}
						return buildWidgetLines(theme, this.state, { maxLines: this.maxLines });
					},
				};
			},
			{ placement: this.placement },
		);
	}

	private scheduleRender(): void {
		if (!this.requestRender) {
			return;
		}

		if (this.renderTimer) {
			return;
		}

		this.renderTimer = setTimeout(() => {
			this.renderTimer = null;
			this.requestRender?.();
		}, this.renderDebounceMs);
		this.renderTimer.unref?.();
	}

	update(state: WidgetState): void {
		this.state = state;
		if (state.status !== "running") {
			this.stopElapsedTimer?.();
		}
		this.mount();
		this.scheduleRender();
	}

	clear(): void {
		if (this.renderTimer) {
			clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}

		this.stopElapsedTimer?.();
		this.stopElapsedTimer = null;
		this.requestRender = null;
		if (this.mounted) {
			this.ctx?.ui?.setWidget(this.key, undefined);
		}
		this.mounted = false;
	}

	dispose(): void {
		this.clear();
	}
}

export const widgetInternals = {
	toStatusColor,
	toStatusLabel,
	truncateCommand,
};
