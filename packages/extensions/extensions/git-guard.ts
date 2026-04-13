/**
 * oh-pi Git Checkpoint Extension
 *
 * Provides four git-safety features for git-managed repositories:
 * 1. **Interactive git guard** — blocks git bash commands that are likely to open an editor and hang
 * 2. **Dirty repo warning** — notifies at session start if there are uncommitted changes
 * 3. **Turn checkpoints** — creates a git stash snapshot before each agent turn
 * 4. **Terminal notification** — sends a desktop/terminal notification when the agent finishes
 *
 * Supports Kitty (OSC 99) and generic terminal (OSC 777) notification protocols.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const INTERACTIVE_GIT_WARNING_PREFIX = "Interactive git command blocked";

interface InteractiveGitDetection {
	reason: string;
	suggestion: string;
}

function hasNonInteractiveEditorOverride(command: string): boolean {
	return /(\bGIT_EDITOR=\S+|\bGIT_SEQUENCE_EDITOR=\S+|-c\s+core\.editor=\S+|-c\s+sequence\.editor=\S+)/.test(command);
}

function hasExplicitCommitMessage(command: string): boolean {
	return /(^|\s)(-m|--message|-F|--file)\s+/.test(command);
}

function hasExplicitMergeMessage(command: string): boolean {
	return /(^|\s)(--no-edit|-m|-F|--file)\s+/.test(command) || /(^|\s)--no-edit(\s|$)/.test(command);
}

function hasExplicitTagMessage(command: string): boolean {
	return /(^|\s)(-m|--message|-F|--file)\s+/.test(command);
}

export function detectInteractiveGitCommand(command: string): InteractiveGitDetection | null {
	if (!/\bgit\b/.test(command)) {
		return null;
	}

	if (
		/\bgit\s+rebase\b/.test(command) &&
		/(^|\s)--continue(\s|$)/.test(command) &&
		!hasNonInteractiveEditorOverride(command)
	) {
		return {
			reason: "`git rebase --continue` can open an editor in agent environments.",
			suggestion:
				"Use `GIT_EDITOR=true GIT_SEQUENCE_EDITOR=true git -c core.editor=true -c sequence.editor=true rebase --continue`.",
		};
	}

	if (
		/\bgit\s+commit\b/.test(command) &&
		!hasExplicitCommitMessage(command) &&
		!/(^|\s)--no-edit(\s|$)/.test(command) &&
		!hasNonInteractiveEditorOverride(command)
	) {
		return {
			reason: "`git commit` without `-m`/`-F` can open an editor in agent environments.",
			suggestion: 'Use `git commit -m "type(scope): description"`.',
		};
	}

	if (
		/\bgit\s+merge\b/.test(command) &&
		!hasExplicitMergeMessage(command) &&
		!hasNonInteractiveEditorOverride(command)
	) {
		return {
			reason: "`git merge` without `--no-edit` or an explicit message can open an editor in agent environments.",
			suggestion: "Use `git merge --no-edit <branch>` or provide `-m` explicitly.",
		};
	}

	if (
		/\bgit\s+tag\b/.test(command) &&
		/(^|\s)(-a|--annotate|-s|--sign)(\s|$)/.test(command) &&
		!hasExplicitTagMessage(command) &&
		!hasNonInteractiveEditorOverride(command)
	) {
		return {
			reason: "Annotated or signed `git tag` can open an editor in agent environments.",
			suggestion: 'Use `git tag -a vX.Y.Z -m "message"`.',
		};
	}

	return null;
}

/**
 * Send a terminal notification using the appropriate escape sequence.
 * Kitty terminals use OSC 99, others use OSC 777 (supported by iTerm2, foot, etc.).
 */
function terminalNotify(title: string, body: string): void {
	if (process.env.KITTY_WINDOW_ID) {
		process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
		process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
	} else {
		process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
	}
}

/**
 * Extension entry point — registers hooks for dirty-repo detection, stash checkpoints,
 * and completion notifications.
 */
export default function (pi: ExtensionAPI) {
	/** Counts the number of agent turns for the checkpoint label. */
	let turnCount = 0;

	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash") {
			return;
		}
		const command = (event.input as { command?: string }).command ?? "";
		const detected = detectInteractiveGitCommand(command);
		if (!detected) {
			return;
		}
		return {
			block: true,
			reason: `${INTERACTIVE_GIT_WARNING_PREFIX}: ${detected.reason} ${detected.suggestion}`,
		};
	});

	// Warn on dirty repo at session start
	pi.on("session_start", async (_event, ctx) => {
		try {
			const { stdout } = await pi.exec("git", ["status", "--porcelain"]);
			if (stdout.trim() && ctx.hasUI) {
				const lines = stdout.trim().split("\n").length;
				ctx.ui.notify(`Dirty repo: ${lines} uncommitted change(s)`, "warning");
			}
		} catch {
			// Not a git repo — nothing to warn about
		}
	});

	// Stash checkpoint before each turn
	pi.on("turn_start", async () => {
		turnCount++;
		try {
			await pi.exec("git", ["stash", "create", "-m", `oh-pi-turn-${turnCount}`]);
		} catch {
			// Not a git repo — skip silently
		}
	});

	// Notify when agent is done
	pi.on("agent_end", () => {
		terminalNotify("oh-pi", `Done after ${turnCount} turn(s). Ready for input.`);
		turnCount = 0;
	});
}
