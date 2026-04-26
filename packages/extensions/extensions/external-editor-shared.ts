import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export type ExternalEditorLaunchResult =
	| { kind: "saved"; text: string }
	| { kind: "cancelled" }
	| { kind: "unavailable"; reason: string }
	| { kind: "failed"; reason: string };

export interface ExternalEditorDependencies {
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
	now?: () => number;
	tmpDir?: () => string;
	spawn?: typeof spawnSync;
	writeFile?: typeof writeFileSync;
	readFile?: typeof readFileSync;
	unlinkFile?: typeof unlinkSync;
	suspendTui?: () => void;
	resumeTui?: () => void;
	requestRender?: (force?: boolean) => void;
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return String(error);
}

export function getConfiguredExternalEditor(env: NodeJS.ProcessEnv = process.env): string | undefined {
	const visual = env.VISUAL?.trim();
	if (visual) {
		return visual;
	}

	const editor = env.EDITOR?.trim();
	return editor || undefined;
}

export function openTextInExternalEditor(
	text: string,
	dependencies: ExternalEditorDependencies = {},
): ExternalEditorLaunchResult {
	const env = dependencies.env ?? process.env;
	const editorCommand = getConfiguredExternalEditor(env);
	if (!editorCommand) {
		return {
			kind: "unavailable",
			reason: "No external editor configured. Set $VISUAL or $EDITOR first.",
		};
	}

	const platform = dependencies.platform ?? process.platform;
	const now = dependencies.now ?? Date.now;
	const tmpDir = dependencies.tmpDir ?? tmpdir;
	const spawn = dependencies.spawn ?? spawnSync;
	const writeFile = dependencies.writeFile ?? writeFileSync;
	const readFile = dependencies.readFile ?? readFileSync;
	const unlinkFile = dependencies.unlinkFile ?? unlinkSync;
	const tmpFilePath = path.join(tmpDir(), `oh-pi-editor-${now()}.md`);
	const [editor, ...editorArgs] = editorCommand.split(" ");
	let tuiSuspended = false;

	try {
		writeFile(tmpFilePath, text, "utf8");
		dependencies.suspendTui?.();
		tuiSuspended = true;

		const result = spawn(editor, [...editorArgs, tmpFilePath], {
			shell: platform === "win32",
			stdio: "inherit",
		}) as SpawnSyncReturns<Buffer>;

		if (result.error) {
			return {
				kind: "failed",
				reason: `Failed to launch external editor: ${toErrorMessage(result.error)}`,
			};
		}

		if (result.status !== 0) {
			return { kind: "cancelled" };
		}

		const nextText = readFile(tmpFilePath, "utf8").replace(/\n$/, "");
		return { kind: "saved", text: nextText };
	} catch (error) {
		return {
			kind: "failed",
			reason: `External editor failed: ${toErrorMessage(error)}`,
		};
	} finally {
		try {
			unlinkFile(tmpFilePath);
		} catch {
			/* Ignore cleanup errors */
		}

		if (tuiSuspended) {
			dependencies.resumeTui?.();
			dependencies.requestRender?.(true);
		}
	}
}
