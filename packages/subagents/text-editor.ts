import { matchesKey } from "@mariozechner/pi-tui";

export interface TextEditorState {
	buffer: string;
	cursor: number;
	viewportOffset: number;
}

export interface TextEditorOptions {
	multiLine?: boolean;
}

export function createEditorState(initial = ""): TextEditorState {
	return {
		buffer: initial,
		cursor: 0,
		viewportOffset: 0,
	};
}

export function wrapText(text: string, width: number): { lines: string[]; starts: number[] } {
	const lines: string[] = [];
	const starts: number[] = [];

	if (width <= 0) {
		return { lines: [text], starts: [0] };
	}

	if (text.length === 0) {
		return { lines: [""], starts: [0] };
	}

	const segments = text.split("\n");
	let offset = 0;

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i] ?? "";
		if (segment.length === 0) {
			starts.push(offset);
			lines.push("");
		} else {
			let pos = 0;
			while (pos < segment.length) {
				starts.push(offset + pos);
				lines.push(segment.slice(pos, pos + width));
				pos += width;
			}
		}

		offset += segment.length;
		if (i < segments.length - 1) {
			offset += 1;
		}
	}

	const endsWithNewline = text.endsWith("\n");
	if (!endsWithNewline) {
		const lastLine = lines[lines.length - 1] ?? "";
		if (text.length > 0 && lastLine.length === width) {
			starts.push(text.length);
			lines.push("");
		}
	}

	return { lines, starts };
}

export function getCursorDisplayPos(cursor: number, starts: number[]): { line: number; col: number } {
	for (let i = starts.length - 1; i >= 0; i--) {
		if (cursor >= starts[i]) {
			return { line: i, col: cursor - starts[i] };
		}
	}
	return { line: 0, col: 0 };
}

export function ensureCursorVisible(cursorLine: number, viewportHeight: number, currentOffset: number): number {
	let offset = currentOffset;

	if (cursorLine < offset) {
		offset = cursorLine;
	} else if (cursorLine >= offset + viewportHeight) {
		offset = cursorLine - viewportHeight + 1;
	}

	return Math.max(0, offset);
}

function isWordChar(ch: string): boolean {
	const code = ch.charCodeAt(0);
	return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

function wordBackward(buffer: string, cursor: number): number {
	let pos = cursor;
	while (pos > 0 && !isWordChar(buffer[pos - 1]!)) pos--;
	while (pos > 0 && isWordChar(buffer[pos - 1]!)) pos--;
	return pos;
}

function wordForward(buffer: string, cursor: number): number {
	const len = buffer.length;
	let pos = cursor;
	while (pos < len && isWordChar(buffer[pos]!)) pos++;
	while (pos < len && !isWordChar(buffer[pos]!)) pos++;
	return pos;
}

function normalizeInsertText(data: string, multiLine: boolean): string | null {
	let text = data;

	text = text.split("\x1b[200~").join("");
	text = text.split("\x1b[201~").join("");
	text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

	if (!multiLine) {
		const nl = text.indexOf("\n");
		if (nl !== -1) text = text.slice(0, nl);
	}

	text = text.replace(/\t/g, "    ");
	if (text.length === 0) return null;

	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code < 32) {
			if (multiLine && text[i] === "\n") continue;
			return null;
		}
	}

	return text;
}

export function handleEditorInput(
	state: TextEditorState,
	data: string,
	textWidth: number,
	options?: TextEditorOptions,
): TextEditorState | null {
	const multiLine = options?.multiLine === true;

	if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
		return null;
	}

	if (matchesKey(data, "return")) {
		if (!multiLine) return null;
		const buffer = state.buffer.slice(0, state.cursor) + "\n" + state.buffer.slice(state.cursor);
		return { ...state, buffer, cursor: state.cursor + 1 };
	}

	const { lines: wrapped, starts } = wrapText(state.buffer, textWidth);
	const cursorPos = getCursorDisplayPos(state.cursor, starts);

	if (matchesKey(data, "alt+left") || matchesKey(data, "ctrl+left")) {
		return { ...state, cursor: wordBackward(state.buffer, state.cursor) };
	}

	if (matchesKey(data, "alt+right") || matchesKey(data, "ctrl+right")) {
		return { ...state, cursor: wordForward(state.buffer, state.cursor) };
	}

	if (matchesKey(data, "left")) {
		if (state.cursor > 0) return { ...state, cursor: state.cursor - 1 };
		return state;
	}

	if (matchesKey(data, "right")) {
		if (state.cursor < state.buffer.length) return { ...state, cursor: state.cursor + 1 };
		return state;
	}

	if (matchesKey(data, "up")) {
		if (cursorPos.line > 0) {
			const targetLine = cursorPos.line - 1;
			const targetCol = Math.min(cursorPos.col, wrapped[targetLine]?.length ?? 0);
			return { ...state, cursor: starts[targetLine] + targetCol };
		}
		return state;
	}

	if (matchesKey(data, "down")) {
		if (cursorPos.line < wrapped.length - 1) {
			const targetLine = cursorPos.line + 1;
			const targetCol = Math.min(cursorPos.col, wrapped[targetLine]?.length ?? 0);
			return { ...state, cursor: starts[targetLine] + targetCol };
		}
		return state;
	}

	if (matchesKey(data, "home")) {
		return { ...state, cursor: starts[cursorPos.line] };
	}

	if (matchesKey(data, "end")) {
		return { ...state, cursor: starts[cursorPos.line] + (wrapped[cursorPos.line]?.length ?? 0) };
	}

	if (matchesKey(data, "ctrl+home")) {
		return { ...state, cursor: 0 };
	}

	if (matchesKey(data, "ctrl+end")) {
		return { ...state, cursor: state.buffer.length };
	}

	if (matchesKey(data, "alt+backspace")) {
		const target = wordBackward(state.buffer, state.cursor);
		if (target === state.cursor) return state;
		const buffer = state.buffer.slice(0, target) + state.buffer.slice(state.cursor);
		return { ...state, buffer, cursor: target };
	}

	if (matchesKey(data, "backspace")) {
		if (state.cursor > 0) {
			const buffer = state.buffer.slice(0, state.cursor - 1) + state.buffer.slice(state.cursor);
			return { ...state, buffer, cursor: state.cursor - 1 };
		}
		return state;
	}

	if (matchesKey(data, "delete")) {
		if (state.cursor < state.buffer.length) {
			const buffer = state.buffer.slice(0, state.cursor) + state.buffer.slice(state.cursor + 1);
			return { ...state, buffer };
		}
		return state;
	}

	const insert = normalizeInsertText(data, multiLine);
	if (insert) {
		const buffer = state.buffer.slice(0, state.cursor) + insert + state.buffer.slice(state.cursor);
		return { ...state, buffer, cursor: state.cursor + insert.length };
	}

	return null;
}

function renderWithCursor(text: string, cursorPos: number): string {
	const before = text.slice(0, cursorPos);
	const cursorChar = text[cursorPos] ?? " ";
	const after = text.slice(cursorPos + 1);
	return `${before}\x1b[7m${cursorChar}\x1b[27m${after}`;
}

export function renderEditor(state: TextEditorState, width: number, viewportHeight: number): string[] {
	const { lines: wrapped, starts } = wrapText(state.buffer, width);
	const cursorPos = getCursorDisplayPos(state.cursor, starts);
	const lines: string[] = [];

	for (let i = 0; i < viewportHeight; i++) {
		const lineIdx = state.viewportOffset + i;
		if (lineIdx < wrapped.length) {
			let content = wrapped[lineIdx] ?? "";
			if (lineIdx === cursorPos.line) {
				content = renderWithCursor(content, cursorPos.col);
			}
			lines.push(content);
		} else {
			lines.push("");
		}
	}

	return lines;
}
