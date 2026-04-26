import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import externalEditorExtension from "./external-editor.js";

describe("external-editor extension", () => {
	it("registers the command and shortcut", () => {
		const harness = createExtensionHarness();
		externalEditorExtension(harness.pi as never);

		expect(harness.commands.has("external-editor")).toBeTruthy();
		expect(harness.shortcuts.has("ctrl+shift+e")).toBeTruthy();
	});

	it("shows status for the configured editor", async () => {
		const harness = createExtensionHarness();
		externalEditorExtension(harness.pi as never);
		const originalVisual = process.env.VISUAL;
		const originalEditor = process.env.EDITOR;
		process.env.VISUAL = "hx";
		process.env.EDITOR = "vim";

		try {
			await harness.commands.get("external-editor").handler("status", harness.ctx);
		} finally {
			process.env.VISUAL = originalVisual;
			process.env.EDITOR = originalEditor;
		}

		expect(harness.notifications.at(-1)?.msg).toContain("External editor: hx");
	});

	it("warns instead of opening when no editor is configured", async () => {
		const harness = createExtensionHarness();
		externalEditorExtension(harness.pi as never);
		const custom = vi.fn();
		harness.ctx.ui.custom = custom;
		const originalVisual = process.env.VISUAL;
		const originalEditor = process.env.EDITOR;
		Reflect.deleteProperty(process.env, "VISUAL");
		Reflect.deleteProperty(process.env, "EDITOR");

		try {
			await harness.commands.get("external-editor").handler("", harness.ctx);
		} finally {
			process.env.VISUAL = originalVisual;
			process.env.EDITOR = originalEditor;
		}

		expect(custom).not.toHaveBeenCalled();
		expect(harness.notifications.at(-1)).toStrictEqual({
			msg: "No external editor configured. Set $VISUAL or $EDITOR first.",
			type: "warning",
		});
	});

	it("syncs the saved draft back into pi after command launch", async () => {
		const harness = createExtensionHarness();
		externalEditorExtension(harness.pi as never);
		harness.editorState.text = "before";
		harness.ctx.ui.custom = vi.fn(async () => ({ kind: "saved", text: "after" }));
		const originalStdinTty = process.stdin.isTTY;
		const originalStdoutTty = process.stdout.isTTY;
		const originalVisual = process.env.VISUAL;
		Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		process.env.VISUAL = "hx";

		try {
			await harness.commands.get("external-editor").handler("", harness.ctx);
		} finally {
			Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: originalStdinTty });
			Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: originalStdoutTty });
			process.env.VISUAL = originalVisual;
		}

		expect(harness.editorState.text).toBe("after");
	});

	it("uses the shortcut handler to launch the same flow", async () => {
		const harness = createExtensionHarness();
		externalEditorExtension(harness.pi as never);
		harness.editorState.text = "before";
		harness.ctx.ui.custom = vi.fn(async () => ({ kind: "saved", text: "after shortcut" }));
		const originalStdinTty = process.stdin.isTTY;
		const originalStdoutTty = process.stdout.isTTY;
		const originalEditor = process.env.EDITOR;
		Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		process.env.EDITOR = "vim";

		try {
			await harness.shortcuts.get("ctrl+shift+e").handler(harness.ctx);
		} finally {
			Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: originalStdinTty });
			Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: originalStdoutTty });
			process.env.EDITOR = originalEditor;
		}

		expect(harness.editorState.text).toBe("after shortcut");
	});
});
