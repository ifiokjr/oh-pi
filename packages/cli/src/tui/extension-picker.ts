import chalk from "chalk";
import { emitKeypressEvents } from "node:readline";

export interface KeypressKey {
	name: string;
	ctrl: boolean;
	meta: boolean;
	shift: boolean;
	sequence: string;
}

export interface ExtensionOption {
	value: string;
	label: string;
	default?: boolean;
}

export interface ExtensionPickerDeps {
	stdout: NodeJS.WriteStream;
	stdin: NodeJS.ReadStream;
}

/** Render the multi-select UI. */
function render(
	options: ExtensionOption[],
	selected: Set<string>,
	cursor: number,
	allSelected: boolean,
	stdout: NodeJS.WriteStream,
) {
	const lines: string[] = [];
	lines.push(chalk.bold.cyan("? Select extensions to install:"));
	lines.push(chalk.dim("  (Space to toggle, A to select/deselect all, Enter to confirm)"));
	lines.push("");
	for (let i = 0; i < options.length; i++) {
		const opt = options[i];
		const isCursor = i === cursor;
		const isSelected = selected.has(opt.value);
		const prefix = isSelected ? chalk.green("◉") : chalk.gray("◯");
		const cursorIndicator = isCursor ? chalk.cyan(">") : " ";
		const label = isCursor ? chalk.cyan.bold(opt.label) : opt.label;
		lines.push(`${cursorIndicator} ${prefix} ${label}`);
	}
	lines.push("");
	lines.push(allSelected ? chalk.dim("  [A] deselect all") : chalk.dim("  [A] select all"));
	const totalLines = options.length + 5;
	stdout.write(`\u001B[${totalLines}A\u001B[J`);
	stdout.write(`${lines.join("\n")}\n`);
}

function updateCursor(key: KeypressKey, cursor: number, options: ExtensionOption[]): number {
	if (key.name === "up" || key.name === "k") {
		return cursor > 0 ? cursor - 1 : options.length - 1;
	}
	if (key.name === "down" || key.name === "j") {
		return cursor < options.length - 1 ? cursor + 1 : 0;
	}
	return cursor;
}

function toggleAll(allSelected: boolean, selected: Set<string>, options: ExtensionOption[]): boolean {
	if (allSelected) {
		selected.clear();
		return false;
	}
	for (const opt of options) {
		selected.add(opt.value);
	}
	return true;
}

function toggleItem(selected: Set<string>, value: string, options: ExtensionOption[]): boolean {
	if (selected.has(value)) {
		selected.delete(value);
	} else {
		selected.add(value);
	}
	return selected.size === options.length;
}

/**
 * Interactive multi-select for extensions.
 *
 * Features:
 *   - Space toggles the item under cursor
 *   - A/a selects or deselects all items
 *   - Enter confirms the selection
 *   - Pre-selected defaults honour `option.default`
 */
export function pickExtensions(
	options: ExtensionOption[],
	deps: ExtensionPickerDeps = { stdin: process.stdin, stdout: process.stdout },
): Promise<string[]> {
	const { stdout, stdin } = deps;
	const selected = new Set<string>(options.filter((o) => o.default).map((o) => o.value));
	let cursor = 0;
	let allSelected = selected.size === options.length;
	if (!stdin.isTTY) {
		return Promise.resolve([...selected]);
	}
	stdout.write("\u001B[?25l");
	stdin.setRawMode(true);
	emitKeypressEvents(stdin);
	stdout.write("\n".repeat(options.length + 5));
	render(options, selected, cursor, allSelected, stdout);
	return new Promise((resolve) => {
		function onKeypress(_str: string, key: KeypressKey): void {
			cursor = updateCursor(key, cursor, options);
			if (key.name === "space") {
				allSelected = toggleItem(selected, options[cursor].value, options);
			} else if (key.name === "a" || key.name === "A") {
				allSelected = toggleAll(allSelected, selected, options);
			} else if (key.name === "return" || key.name === "enter") {
				cleanup();
				resolve([...selected]);
				return;
			} else if (key.name === "c" && key.ctrl) {
				cleanup();
				process.exit(0);
			}
			render(options, selected, cursor, allSelected, stdout);
		}
		function cleanup(): void {
			stdin.removeListener("keypress", onKeypress);
			stdin.setRawMode(false);
			stdin.pause();
			stdout.write("\u001B[?25h");
		}
		stdin.on("keypress", onKeypress);
	});
}
