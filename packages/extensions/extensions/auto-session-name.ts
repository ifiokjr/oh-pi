import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const MAX_NAME_LEN = 72;
const FOCUS_SHIFT_THRESHOLD = 0.35;
const AUTO_CONTINUE_TEXT = "continue";

interface MessageLike {
	role?: string;
	content?: string | Array<{ type?: string; text?: string }>;
}

function toText(content: MessageLike["content"]): string {
	if (!content) {
		return "";
	}

	if (typeof content === "string") {
		return content;
	}

	return content
		.filter((block) => block?.type === "text" && typeof block.text === "string")
		.map((block) => block.text?.trim() ?? "")
		.join(" ")
		.trim();
}

function normalizeLabel(input: string): string {
	return input
		.replaceAll(/\s+/g, " ")
		.replaceAll(/^[-:–—\s]+|[-:–—\s]+$/g, "")
		.slice(0, MAX_NAME_LEN)
		.trim();
}

const TOKENIZE_RE = /[a-z0-9]{3,}/g;

function tokenize(input: string): Set<string> {
	const terms = input.toLowerCase().match(TOKENIZE_RE) ?? [];
	return new Set(terms);
}

function overlapRatio(a: string, b: string): number {
	const left = tokenize(a);
	const right = tokenize(b);
	if (left.size === 0 || right.size === 0) {
		return 1;
	}
	let shared = 0;
	for (const term of left) {
		if (right.has(term)) {
			shared += 1;
		}
	}
	return shared / Math.max(left.size, right.size);
}

function normalizeSessionFile(sessionFile: string | undefined): string | undefined {
	const normalized = sessionFile?.trim();
	return normalized || undefined;
}

function buildResumeCommandHint(sessionFile: string): string {
	return [`Session file: ${sessionFile}`, `Resume now: pi --session ${JSON.stringify(sessionFile)}`].join("\n");
}

function isFocusShift(firstUserText: string, latestUserText: string): boolean {
	if (!(firstUserText && latestUserText)) {
		return false;
	}

	if (latestUserText.length < 12) {
		return false;
	}

	return overlapRatio(firstUserText, latestUserText) < FOCUS_SHIFT_THRESHOLD;
}

function chooseName(messages: MessageLike[], currentName: string): string | undefined {
	const userTexts = messages
		.filter((msg) => msg.role === "user")
		.map((msg) => toText(msg.content))
		.filter(Boolean);
	const assistantTexts = messages
		.filter((msg) => msg.role === "assistant")
		.map((msg) => toText(msg.content))
		.filter(Boolean);

	const firstUser = userTexts[0] ?? "";
	const latestUser = userTexts.at(-1) ?? "";
	const latestAssistant = assistantTexts.at(-1) ?? "";

	if (!currentName) {
		return normalizeLabel(latestUser || firstUser || latestAssistant);
	}

	if (isFocusShift(firstUser, latestUser)) {
		return normalizeLabel(latestUser);
	}

	if (latestAssistant) {
		return normalizeLabel(`${latestUser || currentName} — ${latestAssistant}`);
	}

	return undefined;
}

export default function autoSessionNameExtension(pi: ExtensionAPI) {
	let lastAutoName = "";
	let manualNameLocked = false;
	let compactContinuationQueued = false;

	const emitResumeHint = (reason: "shutdown" | "switch", sessionFile: string | undefined) => {
		const normalizedSessionFile = normalizeSessionFile(sessionFile);
		if (!normalizedSessionFile) {
			return;
		}

		const prefix = reason === "shutdown" ? "Session saved." : "Session switched.";
		pi.sendMessage({
			content: `${prefix}\n${buildResumeCommandHint(normalizedSessionFile)}`,
			customType: "session-resume-hint",
			display: true,
		});
	};

	pi.on("session_start", () => {
		const existing = (pi.getSessionName?.() ?? "").trim();
		lastAutoName = existing;
	});

	pi.on("agent_end", async (event) => {
		const messages = (event as { messages?: MessageLike[] }).messages ?? [];
		if (messages.length === 0 || manualNameLocked) {
			return;
		}

		const current = (pi.getSessionName?.() ?? "").trim();
		if (current && current !== lastAutoName) {
			manualNameLocked = true;
			return;
		}

		const next = chooseName(messages, current);
		if (!(next && next !== current && next !== lastAutoName)) {
			return;
		}

		pi.setSessionName?.(next);
		lastAutoName = next;
	});

	pi.on("compact", () => {
		if (compactContinuationQueued) {
			return;
		}
		compactContinuationQueued = true;
		try {
			pi.sendUserMessage(AUTO_CONTINUE_TEXT);
		} finally {
			setTimeout(() => {
				compactContinuationQueued = false;
			}, 1000);
		}
	});

	pi.on("session_switch", (_event, ctx) => {
		emitResumeHint("switch", ctx.sessionManager?.getSessionFile?.());
	});

	pi.on("session_shutdown", (_event, ctx) => {
		emitResumeHint("shutdown", ctx.sessionManager?.getSessionFile?.());
	});
}
