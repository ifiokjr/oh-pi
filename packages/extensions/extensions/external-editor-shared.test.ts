
import { getConfiguredExternalEditor, openTextInExternalEditor } from "./external-editor-shared";

describe("external editor shared helpers", () => {
	it("prefers VISUAL over EDITOR", () => {
		expect(getConfiguredExternalEditor({ EDITOR: "vim", VISUAL: "hx" })).toBe("hx");
		expect(getConfiguredExternalEditor({ EDITOR: "vim" })).toBe("vim");
		expect(getConfiguredExternalEditor({ EDITOR: "", VISUAL: "   " })).toBeUndefined();
	});

	it("returns unavailable when no editor is configured", () => {
		const result = openTextInExternalEditor("draft", { env: {} });
		expect(result).toStrictEqual({
			kind: "unavailable",
			reason: "No external editor configured. Set $VISUAL or $EDITOR first.",
		});
	});

	it("writes the draft, launches the editor, restores tui, and returns saved text", () => {
		const calls: string[] = [];
		const result = openTextInExternalEditor("hello", {
			env: { EDITOR: "hx" },
			now: () => 42,
			readFile: vi.fn(() => {
				calls.push("read");
				return "updated\n";
			}),
			requestRender: () => {
				calls.push("render");
			},
			resumeTui: () => {
				calls.push("start");
			},
			spawn: vi.fn(() => {
				calls.push("spawn");
				return { status: 0 } as never;
			}),
			suspendTui: () => {
				calls.push("stop");
			},
			tmpDir: () => "/tmp/test-editor",
			unlinkFile: vi.fn(() => {
				calls.push("unlink");
			}),
			writeFile: vi.fn(() => {
				calls.push("write");
			}),
		});

		expect(result).toStrictEqual({ kind: "saved", text: "updated" });
		expect(calls).toStrictEqual(["write", "stop", "spawn", "read", "unlink", "start", "render"]);
	});

	it("keeps the existing draft when the editor exits non-zero", () => {
		const result = openTextInExternalEditor("hello", {
			env: { EDITOR: "hx" },
			readFile: vi.fn(),
			spawn: vi.fn(() => ({ status: 1 }) as never),
			unlinkFile: vi.fn(),
			writeFile: vi.fn(),
		});

		expect(result).toStrictEqual({ kind: "cancelled" });
	});
});
