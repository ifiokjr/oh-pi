import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	detectImageProtocol,
	renderInlineImage,
	getOuterTerminal,
	isTmuxSession,
	__imageInternals,
} from "../src/image-inline.js";

describe("detectImageProtocol", () => {
	beforeEach(() => {
		delete process.env.PRETTY_IMAGE_PROTOCOL;
		delete process.env.TERM_PROGRAM;
		delete process.env.KITTY_WINDOW_ID;
		delete process.env.LC_TERMINAL;
		__imageInternals.resetCachesForTests();
	});

	it("returns none by default", () => {
		expect(detectImageProtocol()).toBe("none");
	});

	it("detects kitty from env", () => {
		process.env.KITTY_WINDOW_ID = "1";
		expect(detectImageProtocol()).toBe("kitty");
	});

	it("detects iterm2 from env", () => {
		process.env.TERM_PROGRAM = "iTerm.app";
		expect(detectImageProtocol()).toBe("iterm2");
	});

	it("respects forced protocol", () => {
		process.env.PRETTY_IMAGE_PROTOCOL = "none";
		process.env.KITTY_WINDOW_ID = "1";
		expect(detectImageProtocol()).toBe("none");
	});
});

describe("renderInlineImage", () => {
	it("returns null for none protocol", () => {
		expect(renderInlineImage("none", "image/png", "abc123")).toBeNull();
	});

	it("generates iterm2 sequence", () => {
		const seq = renderInlineImage("iterm2", "image/png", "abc123");
		expect(seq).toContain("1337");
		expect(seq).toContain("File=inline=1");
	});

	it("generates kitty sequence", () => {
		const seq = renderInlineImage("kitty", "image/png", "abc123", { maxWidth: 40 });
		expect(seq).toContain("_Ga=T");
	});
});

describe("getOuterTerminal", () => {
	it("detects iterm2 from LC_TERMINAL", () => {
		process.env.LC_TERMINAL = "iTerm2";
		expect(getOuterTerminal()).toBe("iTerm.app");
	});

	it("returns unknown-modern for truecolor", () => {
		delete process.env.TERM_PROGRAM;
		process.env.COLORTERM = "truecolor";
		expect(getOuterTerminal()).toBe("unknown-modern");
	});
});

describe("isTmuxSession", () => {
	it("detects tmux from env", () => {
		process.env.TMUX = "/tmp/tmux-1000/default,1234,0";
		expect(isTmuxSession()).toBe(true);
		delete process.env.TMUX;
	});

	it("detects screen from TERM", () => {
		process.env.TERM = "screen-256color";
		expect(isTmuxSession()).toBe(true);
		delete process.env.TERM;
	});
});

describe("tmux passthrough helpers", () => {
	it("returns warning when passthrough is off", () => {
		process.env.TMUX = "/tmp/tmux-1000/default,1234,0";
		const { getTmuxPassthroughWarning, __imageInternals } = require("../src/image-inline.js");
		__imageInternals.setTmuxAllowPassthroughOverrideForTests(false);
		const warning = getTmuxPassthroughWarning("kitty");
		expect(warning).toContain("allow-passthrough is off");
		__imageInternals.setTmuxAllowPassthroughOverrideForTests(undefined);
		delete process.env.TMUX;
	});
});