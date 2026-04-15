import { describe, expect, it, vi } from "vitest";
import { getConfiguredExternalEditor, openTextInExternalEditor } from "./external-editor-shared";

describe("external editor shared helpers", () => {
	it("prefers VISUAL over EDITOR", () => {
		expect(getConfiguredExternalEditor({ VISUAL: "hx", EDITOR: "vim" })).toBe("hx");
		expect(getConfiguredExternalEditor({ EDITOR: "vim" })).toBe("vim");
		expect(getConfiguredExternalEditor({ VISUAL: "   ", EDITOR: "" })).toBeUndefined();
	});

	it("returns unavailable when no editor is configured", () => {
		const result = openTextInExternalEditor("draft", { env: {} });
		expect(result).toEqual({
			kind: "unavailable",
			reason: "No external editor configured. Set $VISUAL or $EDITOR first.",
		});
	});

	it("writes the draft, launches the editor, restores tui, and returns saved text", () => {
		const calls: string[] = [];
		const result = openTextInExternalEditor("hello", {
			env: { EDITOR: "hx" },
			now: () => 42,
			tmpDir: () => "/tmp/test-editor",
			writeFile: vi.fn(() => {
				calls.push("write");
			}),
			readFile: vi.fn(() => {
				calls.push("read");
				return "updated\n";
			}),
			unlinkFile: vi.fn(() => {
				calls.push("unlink");
			}),
			spawn: vi.fn(() => {
				calls.push("spawn");
				return { status: 0 } as never;
			}),
			suspendTui: () => {
				calls.push("stop");
			},
			resumeTui: () => {
				calls.push("start");
			},
			requestRender: () => {
				calls.push("render");
			},
		});

		expect(result).toEqual({ kind: "saved", text: "updated" });
		expect(calls).toEqual(["write", "stop", "spawn", "read", "unlink", "start", "render"]);
	});

	it("keeps the existing draft when the editor exits non-zero", () => {
		const result = openTextInExternalEditor("hello", {
			env: { EDITOR: "hx" },
			writeFile: vi.fn(),
			readFile: vi.fn(),
			unlinkFile: vi.fn(),
			spawn: vi.fn(() => ({ status: 1 }) as never),
		});

		expect(result).toEqual({ kind: "cancelled" });
	});
});
