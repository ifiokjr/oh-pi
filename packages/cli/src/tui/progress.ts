import chalk from "chalk";

export interface ProgressBarDeps {
	stdout: NodeJS.WriteStream;
}

export interface ProgressState {
	total: number;
	current: number;
	label: string;
}

/** Render a single-line progress bar. */
export function renderProgress(state: ProgressState, deps: ProgressBarDeps = { stdout: process.stdout }): void {
	const { stdout } = deps;
	const width = 30;
	const filled = Math.round((state.current / state.total) * width);
	const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
	const pct = Math.round((state.current / state.total) * 100);
	const line = `${chalk.bold("Installing:")} ${bar} ${pct}% ${chalk.dim(state.label)}`;
	// Clear line and rewrite
	stdout.write(`\r\x1B[K${line}`);
}

/** Clear the progress bar line. */
export function clearProgressLine(deps: ProgressBarDeps = { stdout: process.stdout }): void {
	deps.stdout.write("\r\x1B[K");
}

/** Simulate an async installation with progressive updates. */
export async function runWithProgress(
	tasks: { label: string; fn: () => Promise<void> | void }[],
	deps: ProgressBarDeps = { stdout: process.stdout },
): Promise<void> {
	for (let i = 0; i < tasks.length; i++) {
		renderProgress({ total: tasks.length, current: i, label: tasks[i].label }, deps);
		await tasks[i].fn();
	}
	renderProgress({ total: tasks.length, current: tasks.length, label: "Done" }, deps);
	deps.stdout.write("\n");
}
