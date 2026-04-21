import { tailText } from "./truncate.js";

const DEFAULT_COLUMNS = 120;
const DEFAULT_ROWS = 32;
const MAX_CSI_PARAMS = 16;
const MAX_CSI_PARAM_LENGTH = 8;
const RESET_SGR = "\u001B[0m";

const BELL_REGEX = /\u0007/g;
const C0_CONTROL_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F\u007F]/g;
const OSC_SEQUENCE_REGEX = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g;
const CSI_SEQUENCE_REGEX = /\u001B\[([0-9:;?]*)([ -/]*)((?:[@-~]))/g;
const CSI_PARAM_SANITIZE_REGEX = /[^0-9:;?]/g;
const ANSI_STRIP_REGEX = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\))/g;

interface ColorValue {
	kind: "palette" | "rgb";
	value: number;
}

interface CellStyle {
	bold: boolean;
	dim: boolean;
	italic: boolean;
	underline: boolean;
	inverse: boolean;
	hidden: boolean;
	strikethrough: boolean;
	foreground: ColorValue | null;
	background: ColorValue | null;
}

interface TerminalCellLike {
	getChars?: () => string;
	getWidth?: () => number;
	isBold?: () => boolean;
	isDim?: () => boolean;
	isItalic?: () => boolean;
	isUnderline?: () => boolean;
	isInverse?: () => boolean;
	isInvisible?: () => boolean;
	isHidden?: () => boolean;
	isStrikethrough?: () => boolean;
	getFgColorMode?: () => number;
	getBgColorMode?: () => number;
	getFgColor?: () => number;
	getBgColor?: () => number;
	chars?: string;
	width?: number;
	bold?: boolean;
	dim?: boolean;
	italic?: boolean;
	underline?: boolean;
	inverse?: boolean;
	hidden?: boolean;
	invisible?: boolean;
	strikethrough?: boolean;
	fgColorMode?: number;
	bgColorMode?: number;
	fgColor?: number;
	bgColor?: number;
}

interface TerminalLineLike {
	getCell?: (index: number) => TerminalCellLike | undefined;
	translateToString?: (trimRight?: boolean) => string;
}

interface TerminalBufferLike {
	active?: {
		baseY?: number;
		cursorY?: number;
		length?: number;
		getLine?: (index: number) => TerminalLineLike | undefined;
	};
}

interface HeadlessTerminalLike {
	write(data: string, callback?: () => void): void;
	resize(cols: number, rows: number): void;
	dispose(): void;
	buffer?: TerminalBufferLike;
}

interface HeadlessModuleLike {
	Terminal: new (options: Record<string, unknown>) => HeadlessTerminalLike;
}

export interface TerminalEmulator {
	write(data: string): Promise<void>;
	resize(columns: number, rows: number): void;
	toAnsiLines(maxLines?: number): string[];
	getPlainText(): string;
	dispose(): void;
}

export interface CreateTerminalEmulatorOptions {
	columns?: number;
	rows?: number;
}

const DEFAULT_CELL_STYLE: CellStyle = {
	bold: false,
	dim: false,
	italic: false,
	underline: false,
	inverse: false,
	hidden: false,
	strikethrough: false,
	foreground: null,
	background: null,
};

const DEFAULT_HEADLESS_MODULE_LOADER = async (): Promise<HeadlessModuleLike> => {
	return (await import("@xterm/headless")) as HeadlessModuleLike;
};

let headlessModuleLoader: () => Promise<HeadlessModuleLike> = DEFAULT_HEADLESS_MODULE_LOADER;

function getBoolean(source: TerminalCellLike | undefined, methodName: keyof TerminalCellLike, propName: keyof TerminalCellLike): boolean {
	const method = source?.[methodName] as ((this: TerminalCellLike | undefined) => unknown) | undefined;
	if (typeof method === "function") {
		return Boolean(method.call(source));
	}

	return Boolean(source?.[propName]);
}

function getNumber(source: TerminalCellLike | undefined, methodName: keyof TerminalCellLike, propName: keyof TerminalCellLike): number | undefined {
	const method = source?.[methodName] as ((this: TerminalCellLike | undefined) => unknown) | undefined;
	if (typeof method === "function") {
		const value = method.call(source);
		return typeof value === "number" ? value : undefined;
	}

	const value = source?.[propName];
	return typeof value === "number" ? value : undefined;
}

function sanitizeCsiParams(params: string): string {
	if (!params) {
		return "";
	}

	const rawParts = params.replace(CSI_PARAM_SANITIZE_REGEX, "").split(";");
	const safeParts: string[] = [];
	for (const rawPart of rawParts) {
		if (!rawPart) {
			continue;
		}

		safeParts.push(rawPart.slice(0, MAX_CSI_PARAM_LENGTH));
		if (safeParts.length >= MAX_CSI_PARAMS) {
			break;
		}
	}
	return safeParts.join(";");
}

export function sanitizeAnsiOutput(text: string): string {
	if (!text) {
		return text;
	}

	return text
		.replace(OSC_SEQUENCE_REGEX, "")
		.replace(BELL_REGEX, "")
		.replace(CSI_SEQUENCE_REGEX, (_match, params: string, intermediates: string, final: string) => {
			return `\u001B[${sanitizeCsiParams(params)}${intermediates}${final}`;
		})
		.replace(C0_CONTROL_REGEX, "");
}

export function stripAnsiSequences(text: string): string {
	if (!text) {
		return text;
	}

	return text.replace(ANSI_STRIP_REGEX, "").replace(C0_CONTROL_REGEX, "");
}

function decodeRgb(value: number): [number, number, number] {
	return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function readColor(cell: TerminalCellLike | undefined, type: "fg" | "bg"): ColorValue | null {
	const mode = getNumber(
		cell,
		type === "fg" ? "getFgColorMode" : "getBgColorMode",
		type === "fg" ? "fgColorMode" : "bgColorMode",
	);
	const value = getNumber(cell, type === "fg" ? "getFgColor" : "getBgColor", type === "fg" ? "fgColor" : "bgColor");

	if (value == null) {
		return null;
	}

	if (mode == null || mode === 0) {
		return value === 0 ? null : { kind: value > 0xff ? "rgb" : "palette", value };
	}

	if (mode === 3 || value > 0xff) {
		return { kind: "rgb", value };
	}

	if (mode === 2 || mode === 1) {
		return { kind: "palette", value: Math.max(0, Math.min(255, value)) };
	}

	return null;
}

function readCellChars(cell: TerminalCellLike | undefined): string {
	const charsFromMethod = cell?.getChars?.();
	if (typeof charsFromMethod === "string" && charsFromMethod.length > 0) {
		return charsFromMethod;
	}

	if (typeof cell?.chars === "string" && cell.chars.length > 0) {
		return cell.chars;
	}

	return " ";
}

function readCellWidth(cell: TerminalCellLike | undefined): number {
	const width = getNumber(cell, "getWidth", "width");
	if (width == null) {
		return 1;
	}

	return width;
}

function readCellStyle(cell: TerminalCellLike | undefined): CellStyle {
	return {
		bold: getBoolean(cell, "isBold", "bold"),
		dim: getBoolean(cell, "isDim", "dim"),
		italic: getBoolean(cell, "isItalic", "italic"),
		underline: getBoolean(cell, "isUnderline", "underline"),
		inverse: getBoolean(cell, "isInverse", "inverse"),
		hidden: getBoolean(cell, "isInvisible", "invisible") || getBoolean(cell, "isHidden", "hidden"),
		strikethrough: getBoolean(cell, "isStrikethrough", "strikethrough"),
		foreground: readColor(cell, "fg"),
		background: readColor(cell, "bg"),
	};
}

function stylesEqual(left: CellStyle, right: CellStyle): boolean {
	return (
		left.bold === right.bold &&
		left.dim === right.dim &&
		left.italic === right.italic &&
		left.underline === right.underline &&
		left.inverse === right.inverse &&
		left.hidden === right.hidden &&
		left.strikethrough === right.strikethrough &&
		left.foreground?.kind === right.foreground?.kind &&
		left.foreground?.value === right.foreground?.value &&
		left.background?.kind === right.background?.kind &&
		left.background?.value === right.background?.value
	);
}

function isDefaultStyle(style: CellStyle): boolean {
	return stylesEqual(style, DEFAULT_CELL_STYLE);
}

function colorToCodes(color: ColorValue | null, prefix: 38 | 48): string[] {
	if (!color) {
		return [];
	}

	if (color.kind === "palette") {
		return [`${prefix}`, "5", `${color.value}`];
	}

	const [red, green, blue] = decodeRgb(color.value);
	return [`${prefix}`, "2", `${red}`, `${green}`, `${blue}`];
}

export function styleToSgr(style: CellStyle): string {
	if (isDefaultStyle(style)) {
		return RESET_SGR;
	}

	const codes = ["0"];
	if (style.bold) {
		codes.push("1");
	}
	if (style.dim) {
		codes.push("2");
	}
	if (style.italic) {
		codes.push("3");
	}
	if (style.underline) {
		codes.push("4");
	}
	if (style.inverse) {
		codes.push("7");
	}
	if (style.hidden) {
		codes.push("8");
	}
	if (style.strikethrough) {
		codes.push("9");
	}

	const foreground = style.inverse ? style.background : style.foreground;
	const background = style.inverse ? style.foreground : style.background;
	codes.push(...colorToCodes(foreground, 38), ...colorToCodes(background, 48));
	return `\u001B[${codes.join(";")}m`;
}

function getVisibleLineIndexes(buffer: TerminalBufferLike["active"], rows: number): [number, number] {
	const length = Math.max(0, buffer?.length ?? rows);
	if (length === 0) {
		return [0, -1];
	}

	const baseY = Math.max(0, buffer?.baseY ?? 0);
	const lastIndex = Math.min(length - 1, Math.max(baseY + rows - 1, baseY + (buffer?.cursorY ?? 0)));
	const firstIndex = Math.max(0, lastIndex - rows + 1);
	return [firstIndex, lastIndex];
}

export function renderLineToAnsi(line: TerminalLineLike | undefined, columns: number): string {
	if (!line) {
		return "";
	}

	if (typeof line.getCell !== "function") {
		return line.translateToString?.(true) ?? "";
	}

	const cells: Array<{ chars: string; style: CellStyle }> = [];
	for (let column = 0; column < columns; column++) {
		const cell = line.getCell(column);
		if (!cell) {
			break;
		}

		if (readCellWidth(cell) === 0) {
			continue;
		}

		const style = readCellStyle(cell);
		const chars = style.hidden ? " " : readCellChars(cell);
		cells.push({ chars, style });
	}

	let lastVisibleIndex = cells.length - 1;
	while (lastVisibleIndex >= 0 && cells[lastVisibleIndex]?.chars === " ") {
		lastVisibleIndex--;
	}

	if (lastVisibleIndex < 0) {
		return "";
	}

	let output = "";
	let previousStyle = DEFAULT_CELL_STYLE;
	for (let index = 0; index <= lastVisibleIndex; index++) {
		const cell = cells[index];
		const nextStyle = cell.style;
		if (!stylesEqual(previousStyle, nextStyle)) {
			output += styleToSgr(nextStyle);
			previousStyle = nextStyle;
		}

		output += cell.chars;
	}

	if (!isDefaultStyle(previousStyle)) {
		output += RESET_SGR;
	}
	return output;
}

class PlainTextTerminalEmulator implements TerminalEmulator {
	private buffer = "";

	async write(data: string): Promise<void> {
		this.buffer += stripAnsiSequences(sanitizeAnsiOutput(data));
	}

	resize(_columns: number, _rows: number): void {}

	toAnsiLines(maxLines = DEFAULT_ROWS): string[] {
		const tailedText = tailText(this.buffer, maxLines);
		return tailedText ? tailedText.split("\n") : [];
	}

	getPlainText(): string {
		return this.buffer;
	}

	dispose(): void {}
}

class XtermHeadlessTerminalEmulator implements TerminalEmulator {
	constructor(
		private readonly terminal: HeadlessTerminalLike,
		private columns: number,
		private rows: number,
		private readonly plainTextChunks: string[] = [],
	) {}

	async write(data: string): Promise<void> {
		const sanitizedData = sanitizeAnsiOutput(data);
		this.plainTextChunks.push(stripAnsiSequences(sanitizedData));
		await new Promise<void>((resolve) => {
			let settled = false;
			const finish = () => {
				if (settled) {
					return;
				}
				settled = true;
				resolve();
			};
			try {
				this.terminal.write(sanitizedData, finish);
				if (this.terminal.write.length < 2) {
					finish();
				}
			} catch {
				finish();
			}
		});
	}

	resize(columns: number, rows: number): void {
		this.columns = columns;
		this.rows = rows;
		this.terminal.resize(columns, rows);
	}

	toAnsiLines(maxLines = this.rows): string[] {
		const activeBuffer = this.terminal.buffer?.active;
		if (!activeBuffer?.getLine) {
			const fallback = tailText(this.getPlainText(), maxLines);
			return fallback ? fallback.split("\n") : [];
		}

		const [firstIndex, lastIndex] = getVisibleLineIndexes(activeBuffer, this.rows);
		const lines: string[] = [];
		for (let index = firstIndex; index <= lastIndex; index++) {
			lines.push(renderLineToAnsi(activeBuffer.getLine(index), this.columns));
		}

		return lines.slice(-maxLines);
	}

	getPlainText(): string {
		return this.plainTextChunks.join("");
	}

	dispose(): void {
		this.terminal.dispose();
	}
}

export function setHeadlessModuleLoader(loader: () => Promise<HeadlessModuleLike>): void {
	headlessModuleLoader = loader;
}

export function resetHeadlessModuleLoader(): void {
	headlessModuleLoader = DEFAULT_HEADLESS_MODULE_LOADER;
}

export async function createTerminalEmulator(options: CreateTerminalEmulatorOptions = {}): Promise<TerminalEmulator> {
	const columns = options.columns ?? DEFAULT_COLUMNS;
	const rows = options.rows ?? DEFAULT_ROWS;

	try {
		const headlessModule = await headlessModuleLoader();
		if (typeof headlessModule.Terminal !== "function") {
			return new PlainTextTerminalEmulator();
		}

		const terminal = new headlessModule.Terminal({
			allowProposedApi: false,
			cols: columns,
			rows,
			scrollback: rows * 4,
		});
		return new XtermHeadlessTerminalEmulator(terminal, columns, rows);
	} catch {
		return new PlainTextTerminalEmulator();
	}
}

export const terminalEmulatorInternals = {
	decodeRgb,
	sanitizeCsiParams,
	getVisibleLineIndexes,
	stylesEqual,
};
