
import {
	createTerminalEmulator,
	renderLineToAnsi,
	resetHeadlessModuleLoader,
	sanitizeAnsiOutput,
	setHeadlessModuleLoader,
	stripAnsiSequences,
	styleToSgr,
	terminalEmulatorInternals,
} from "../src/terminal-emulator.js";

function makeCell(overrides: Record<string, unknown> = {}) {
	return {
		getBgColor: () => (overrides.bgColor as number | undefined) ?? 0,
		getBgColorMode: () => (overrides.bgColorMode as number | undefined) ?? 0,
		getChars: () => (overrides.chars as string | undefined) ?? " ",
		getFgColor: () => (overrides.fgColor as number | undefined) ?? 0,
		getFgColorMode: () => (overrides.fgColorMode as number | undefined) ?? 0,
		getWidth: () => (overrides.width as number | undefined) ?? 1,
		isBold: () => Boolean(overrides.bold),
		isDim: () => Boolean(overrides.dim),
		isInverse: () => Boolean(overrides.inverse),
		isInvisible: () => Boolean(overrides.invisible),
		isItalic: () => Boolean(overrides.italic),
		isStrikethrough: () => Boolean(overrides.strikethrough),
		isUnderline: () => Boolean(overrides.underline),
	};
}

describe("terminal emulator", () => {
	afterEach(() => {
		resetHeadlessModuleLoader();
	});

	it("sanitizes ANSI payloads and strips escape sequences", () => {
		expect(sanitizeAnsiOutput("")).toBe("");
		expect(stripAnsiSequences("")).toBe("");
		const sanitized = sanitizeAnsiOutput(
			"hello\u0007\u001B]0;title\u0007\u001B[1;2;3;4;5;6;7;8;9;10;11;12;13;14;15;16;17mworld\u0001",
		);
		expect(sanitized).not.toContain("\u0007");
		expect(sanitized).not.toContain("]0;title");
		expect(sanitized).toContain("\u001B[1;2;3;4;5;6;7;8;9;10;11;12;13;14;15;16m");
		expect(stripAnsiSequences("\u001B[31mred\u001B[0m")).toBe("red");
		expect(terminalEmulatorInternals.sanitizeCsiParams("1;abc;222222222")).toBe("1;22222222");
		expect(terminalEmulatorInternals.sanitizeCsiParams("")).toBe("");
	});

	it("renders ANSI lines from xterm-style cells and falls back for simple lines", () => {
		const propLine = {
			getCell(index: number) {
				const cells = [
					{ bold: true, chars: "P", fgColor: 0x112233, width: 1 },
					{ chars: "Q", underline: true, width: 1 },
					{ chars: "R", fgColor: 5, width: 1 },
					{ chars: "S", fgColor: 7, fgColorMode: 1, width: 1 },
					{
						chars: "T",
						getFgColorMode: () => "bad" as never,
						getWidth: () => "bad" as never,
						width: 1,
					},
				];
				return cells[index] as never;
			},
		};
		const propRendered = renderLineToAnsi(propLine, 5);
		expect(propRendered).toContain("\u001B[0;1;38;2;17;34;51mP");
		expect(propRendered).toContain("\u001B[0;38;5;5mR");
		expect(propRendered).toContain("\u001B[0;38;5;7mS");
		expect(renderLineToAnsi({ getCell: () => makeCell({ chars: " ", width: 1 }) }, 1)).toBe("");

		const styledLine = {
			getCell(index: number) {
				const cells = [
					makeCell({ bold: true, chars: "A", fgColor: 2, fgColorMode: 2 }),
					makeCell({ bgColor: 0x102030, bgColorMode: 3, chars: "B", fgColor: 1, fgColorMode: 2, inverse: true }),
					makeCell({ chars: " ", width: 1 }),
					makeCell({ chars: "C", width: 0 }),
					makeCell({ chars: "D", invisible: true, strikethrough: true }),
				];
				return cells[index];
			},
		};

		const rendered = renderLineToAnsi(styledLine, 5);
		expect(rendered).toContain("\u001B[0;1;38;5;2mA");
		expect(rendered).toContain("\u001B[0;7;38;2;16;32;48;48;5;1mB");
		expect(rendered.endsWith("\u001B[0m")).toBeTruthy();
		expect(renderLineToAnsi({ translateToString: () => "plain" }, 10)).toBe("plain");
		expect(renderLineToAnsi({} as never, 10)).toBe("");
		expect(renderLineToAnsi(undefined, 10)).toBe("");
		expect(
			styleToSgr({
				background: null,
				bold: false,
				dim: false,
				foreground: null,
				hidden: false,
				inverse: false,
				italic: false,
				strikethrough: false,
				underline: false,
			}),
		).toBe("\u001B[0m");
	});

	it("uses the injected headless terminal loader when available", async () => {
		class FakeTerminal {
			buffer = {
				active: {
					baseY: 1,
					cursorY: 0,
					getLine(index: number) {
						const lines = [
							{ translateToString: () => "skip-0" },
							{ translateToString: () => "screen-1" },
							{ translateToString: () => "screen-2" },
							{ translateToString: () => "screen-3" },
						];
						return lines[index];
					},
					length: 4,
				},
			};
			writeCalls: string[] = [];
			resizes: [number, number][] = [];
			write(data: string, callback?: () => void) {
				this.writeCalls.push(data);
				callback?.();
			}
			resize(cols: number, rows: number) {
				this.resizes.push([cols, rows]);
			}
			dispose() {}
		}

		setHeadlessModuleLoader(async () => ({ Terminal: FakeTerminal as never }));
		const emulator = await createTerminalEmulator({ columns: 10, rows: 2 });
		await emulator.write("\u001B[31mhello\u001B[0m");
		emulator.resize(20, 3);

		expect(emulator.getPlainText()).toBe("hello");
		expect(emulator.toAnsiLines(2)).toStrictEqual(["screen-2", "screen-3"]);
		expect(terminalEmulatorInternals.decodeRgb(0x11_22_33)).toStrictEqual([17, 34, 51]);
		expect(
			terminalEmulatorInternals.stylesEqual(
				{
					background: { kind: "palette", value: 1 },
					bold: false,
					dim: false,
					foreground: null,
					hidden: false,
					inverse: false,
					italic: false,
					strikethrough: false,
					underline: false,
				},
				{
					background: { kind: "palette", value: 1 },
					bold: false,
					dim: false,
					foreground: null,
					hidden: false,
					inverse: false,
					italic: false,
					strikethrough: false,
					underline: false,
				},
			),
		).toBeTruthy();
		expect(terminalEmulatorInternals.getVisibleLineIndexes({ baseY: 2, cursorY: 0, length: 6 }, 3)).toStrictEqual([2, 4]);
		expect(terminalEmulatorInternals.getVisibleLineIndexes({ length: 0 }, 2)).toStrictEqual([0, -1]);
		expect(terminalEmulatorInternals.getVisibleLineIndexes(undefined as never, 2)).toStrictEqual([0, 1]);
		emulator.dispose();
	});

	it("covers fallback branches when terminal writes fail or no buffer lines are available", async () => {
		class ThrowingTerminal {
			buffer = { active: {} };
			write() {
				throw new Error("write failed");
			}
			resize() {}
			dispose() {}
		}

		setHeadlessModuleLoader(async () => ({ Terminal: ThrowingTerminal as never }));
		const emulator = await createTerminalEmulator({ rows: 1 });
		emulator.resize(2, 1);
		expect(emulator.toAnsiLines(1)).toStrictEqual([]);
		await emulator.write("boom");
		expect(emulator.toAnsiLines(1)).toStrictEqual(["boom"]);
		expect(terminalEmulatorInternals.getVisibleLineIndexes({ length: 0 }, 2)).toStrictEqual([0, -1]);
		emulator.dispose();
	});

	it("falls back to a plain text emulator when xterm is unavailable", async () => {
		setHeadlessModuleLoader(async () => {
			throw new Error("missing");
		});
		const emulator = await createTerminalEmulator({ rows: 2 });
		await emulator.write("one\n\u001B[31mtwo\u001B[0m\nthree");
		expect(emulator.toAnsiLines(2)).toStrictEqual(["two", "three"]);
		expect(emulator.getPlainText()).toContain("one");
		emulator.dispose();

		setHeadlessModuleLoader(async () => ({ Terminal: undefined as never }));
		const fallback = await createTerminalEmulator();
		fallback.resize(1, 1);
		expect(fallback.toAnsiLines()).toStrictEqual([]);
		await fallback.write("plain");
		expect(fallback.toAnsiLines()).toStrictEqual(["plain"]);
	});
});
