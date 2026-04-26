import { execFileSync } from "node:child_process";

declare global {
	var TMUX_CLIENT_TERM_OVERRIDE: string | null | undefined;
	var TMUX_ALLOW_PASSTHROUGH_OVERRIDE: boolean | null | undefined;
}

export type ImageProtocol = "iterm2" | "kitty" | "none";

const TMUX_CLIENT_TERM_OVERRIDE: string | null | undefined = undefined;
const TMUX_ALLOW_PASSTHROUGH_OVERRIDE: boolean | null | undefined = undefined;
let TMUX_CLIENT_TERM_CACHE;
let TMUX_ALLOW_PASSTHROUGH_CACHE;

// Hoisted regex (performance rule #1)
const TMUX_TERM_RE = /^(tmux|screen)/;

export function isTmuxSession(): boolean {
	return Boolean(process.env.TMUX) || TMUX_TERM_RE.test(process.env.TERM ?? "");
}

function normalizeTerminalName(term: string): string {
	const t = term.toLowerCase();
	if (t.includes("kitty")) {
		return "kitty";
	}
	if (t.includes("ghostty")) {
		return "ghostty";
	}
	if (t.includes("wezterm")) {
		return "WezTerm";
	}
	if (t.includes("iterm")) {
		return "iTerm.app";
	}
	if (t.includes("mintty")) {
		return "mintty";
	}
	return term;
}

function readTmuxClientTerm(): string | null {
	if (TMUX_CLIENT_TERM_OVERRIDE !== undefined) {
		return TMUX_CLIENT_TERM_OVERRIDE ? normalizeTerminalName(TMUX_CLIENT_TERM_OVERRIDE) : null;
	}
	if (!isTmuxSession()) {
		return null;
	}
	if (TMUX_CLIENT_TERM_CACHE !== undefined) {
		return TMUX_CLIENT_TERM_CACHE;
	} // Patch-coverage-ignore
	try {
		const term = execFileSync("tmux", ["display-message", "-p", "#{client_termname}"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 200,
		}).trim();
		TMUX_CLIENT_TERM_CACHE = term ? normalizeTerminalName(term) : null;
	} catch {
		// Patch-coverage-ignore
		TMUX_CLIENT_TERM_CACHE = null;
	}
	return TMUX_CLIENT_TERM_CACHE;
}

export function getOuterTerminal(): string {
	if (process.env.LC_TERMINAL === "iTerm2") {
		return "iTerm.app";
	}
	if (process.env.GHOSTTY_RESOURCES_DIR) {
		return "ghostty";
	}
	if (process.env.KITTY_WINDOW_ID || process.env.KITTY_PID) {
		return "kitty";
	}
	if (process.env.WEZTERM_EXECUTABLE || process.env.WEZTERM_CONFIG_DIR || process.env.WEZTERM_CONFIG_FILE) {
		return "WezTerm";
	}
	const termProgram = process.env.TERM_PROGRAM ?? "";
	if (termProgram && termProgram !== "tmux" && termProgram !== "screen") {
		return normalizeTerminalName(termProgram);
	}
	const tmuxClientTerm = readTmuxClientTerm();
	if (tmuxClientTerm) {
		return tmuxClientTerm;
	}
	const term = process.env.TERM ?? "";
	if (term) {
		return normalizeTerminalName(term);
	}
	if (process.env.COLORTERM === "truecolor" || process.env.COLORTERM === "24bit") {
		return "unknown-modern";
	}
	return termProgram;
}

export function detectImageProtocol(): ImageProtocol {
	const forced = (process.env.PRETTY_IMAGE_PROTOCOL ?? "").toLowerCase();
	if (forced === "kitty" || forced === "iterm2" || forced === "none") {
		return forced as ImageProtocol;
	}
	const term = getOuterTerminal();
	if (term === "ghostty" || term === "kitty") {
		return "kitty";
	}
	if (["iTerm.app", "WezTerm", "mintty"].includes(term)) {
		return "iterm2";
	}
	if (process.env.LC_TERMINAL === "iTerm2") {
		return "iterm2";
	}
	return "none";
}

export function tmuxAllowsPassthrough(): boolean | null {
	if (TMUX_ALLOW_PASSTHROUGH_OVERRIDE !== undefined) {
		return TMUX_ALLOW_PASSTHROUGH_OVERRIDE;
	}
	if (!isTmuxSession()) {
		return null;
	}
	if (TMUX_ALLOW_PASSTHROUGH_CACHE !== undefined) {
		return TMUX_ALLOW_PASSTHROUGH_CACHE;
	}
	try {
		const value = execFileSync("tmux", ["show-options", "-gv", "allow-passthrough"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 200,
		})
			.trim()
			.toLowerCase();
		TMUX_ALLOW_PASSTHROUGH_CACHE = value === "on" || value === "all";
	} catch {
		// Patch-coverage-ignore
		TMUX_ALLOW_PASSTHROUGH_CACHE = null;
	}
	return TMUX_ALLOW_PASSTHROUGH_CACHE;
}

export function getTmuxPassthroughWarning(protocol: ImageProtocol): string | null {
	if (!isTmuxSession() || protocol === "none") {
		return null;
	}
	if (tmuxAllowsPassthrough() === false) {
		return "tmux allow-passthrough is off. Run: tmux set -g allow-passthrough on";
	}
	return null;
}

function tmuxWrap(seq: string): string {
	if (!isTmuxSession()) {
		return seq;
	}
	const escaped = seq.split("\x1B").join("\u001b\u001b");
	return `\x1BPtmux;${escaped}\x1B\\`;
}

export function renderInlineImage(
	protocol: ImageProtocol,
	mediaType: string,
	base64Data: string,
	opts: { maxWidth?: number } = {},
): string | null {
	if (protocol === "none") {
		return null;
	}

	const mime = mediaType;
	if (protocol === "iterm2") {
		const seq = `\x1B]1337;File=inline=1:${base64Data}\u0007`;
		return tmuxWrap(seq);
	}
	if (protocol === "kitty") {
		const seq = `\u001b_Ga=T,f=100,s=${opts.maxWidth ?? 80};${base64Data}\u001b\\`;
		return tmuxWrap(seq);
	}
	return null;
}

// Test helpers
export const __imageInternals = {
	detectImageProtocol,
	getOuterTerminal,
	getTmuxPassthroughWarning,
	isTmuxSession,
	resetCachesForTests: () => {
		TMUX_CLIENT_TERM_CACHE = undefined;
		TMUX_ALLOW_PASSTHROUGH_CACHE = undefined;
		globalThis.TMUX_CLIENT_TERM_OVERRIDE = undefined;
		globalThis.TMUX_ALLOW_PASSTHROUGH_OVERRIDE = undefined;
	},
	setTmuxAllowPassthroughOverrideForTests: (value: boolean | null | undefined) => {
		globalThis.TMUX_ALLOW_PASSTHROUGH_OVERRIDE = value;
	},
	setTmuxClientTermOverrideForTests: (value: string | null | undefined) => {
		globalThis.TMUX_CLIENT_TERM_OVERRIDE = value;
	},
	tmuxAllowsPassthrough,
	tmuxWrap,
};
