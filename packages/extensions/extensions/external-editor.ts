import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { Component, KeybindingsManager, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth } from "@mariozechner/pi-tui";
import {
	type ExternalEditorLaunchResult,
	getConfiguredExternalEditor,
	openTextInExternalEditor,
} from "./external-editor-shared";

const SHORTCUT = "ctrl+shift+e";
const COMMAND = "external-editor";

class ExternalEditorLauncher implements Component {
	private launched = false;

	constructor(
		private readonly tui: TUI,
		private readonly initialText: string,
		private readonly done: (result: ExternalEditorLaunchResult) => void,
	) {}

	render(width: number): string[] {
		if (!this.launched) {
			this.launched = true;
			queueMicrotask(() => {
				const result = openTextInExternalEditor(this.initialText, {
					suspendTui: () => this.tui.stop(),
					resumeTui: () => this.tui.start(),
					requestRender: (force) => this.tui.requestRender(force),
				});
				this.done(result);
			});
		}

		return [truncateToWidth("Opening external editor...", width)];
	}

	invalidate(): void {
		/* stateless */
	}
}

function showExternalEditorStatus(ctx: ExtensionCommandContext): void {
	const editorCommand = getConfiguredExternalEditor();
	if (!editorCommand) {
		ctx.ui.notify("No external editor configured. Set $VISUAL or $EDITOR first.", "warning");
		return;
	}

	ctx.ui.notify(
		[
			`External editor: ${editorCommand}`,
			`Use /${COMMAND} or ${SHORTCUT} to edit the current draft.`,
			"Pi's built-in app.editor.external binding (Ctrl+G by default) still works too.",
		].join(" "),
		"info",
	);
}

async function launchExternalEditorForDraft(ctx: ExtensionCommandContext): Promise<void> {
	const editorCommand = getConfiguredExternalEditor();
	if (!editorCommand) {
		ctx.ui.notify("No external editor configured. Set $VISUAL or $EDITOR first.", "warning");
		return;
	}

	if (!(process.stdin.isTTY && process.stdout.isTTY)) {
		ctx.ui.notify("External editor launch only works in interactive terminal mode.", "warning");
		return;
	}

	const currentText = typeof ctx.ui.getEditorText === "function" ? ctx.ui.getEditorText() : "";
	const result = await ctx.ui.custom<ExternalEditorLaunchResult>((tui: TUI, _theme, _kb: KeybindingsManager, done) => {
		return new ExternalEditorLauncher(tui, currentText, done);
	});

	if (!result || result.kind === "cancelled") {
		return;
	}

	if (result.kind === "unavailable" || result.kind === "failed") {
		ctx.ui.notify(result.reason, "warning");
		return;
	}

	if (typeof ctx.ui.setEditorText === "function") {
		ctx.ui.setEditorText(result.text);
	}
}

export default function externalEditorExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND, {
		description: "Open the current draft in $VISUAL/$EDITOR and sync the result back into pi.",
		getArgumentCompletions(prefix) {
			const items = [
				{ value: "status", label: "status", description: "Show the configured editor and available bindings" },
			];
			const filtered = items.filter((item) => item.value.startsWith(prefix.trim()));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			if (args.trim() === "status") {
				showExternalEditorStatus(ctx);
				return;
			}

			await launchExternalEditorForDraft(ctx);
		},
	});

	pi.registerShortcut(SHORTCUT, {
		description: "Open the current draft in the configured external editor",
		handler: async (ctx) => {
			await launchExternalEditorForDraft(ctx as ExtensionCommandContext);
		},
	});
}
