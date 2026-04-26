
import {
	__imageInternals,
	detectImageProtocol,
	getOuterTerminal,
	getTmuxPassthroughWarning,
	isTmuxSession,
	renderInlineImage,
} from "../src/image-inline.js";

describe(detectImageProtocol, () => {
	beforeEach(() => {
		delete process.env.PRETTY_IMAGE_PROTOCOL;
		delete process.env.TERM_PROGRAM;
		delete process.env.TERM;
		delete process.env.KITTY_WINDOW_ID;
		delete process.env.KITTY_PID;
		delete process.env.LC_TERMINAL;
		delete process.env.GHOSTTY_RESOURCES_DIR;
		delete process.env.WEZTERM_EXECUTABLE;
		delete process.env.WEZTERM_CONFIG_DIR;
		delete process.env.WEZTERM_CONFIG_FILE;
		delete process.env.COLORTERM;
		__imageInternals.resetCachesForTests();
	});

	afterEach(() => {
		delete process.env.PRETTY_IMAGE_PROTOCOL;
		delete process.env.TERM_PROGRAM;
		delete process.env.TERM;
		delete process.env.KITTY_WINDOW_ID;
		delete process.env.KITTY_PID;
		delete process.env.LC_TERMINAL;
		delete process.env.GHOSTTY_RESOURCES_DIR;
		delete process.env.WEZTERM_EXECUTABLE;
		delete process.env.WEZTERM_CONFIG_DIR;
		delete process.env.WEZTERM_CONFIG_FILE;
		delete process.env.COLORTERM;
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

describe(renderInlineImage, () => {
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

describe(getOuterTerminal, () => {
	beforeEach(() => {
		delete process.env.PRETTY_IMAGE_PROTOCOL;
		delete process.env.TERM_PROGRAM;
		delete process.env.TERM;
		delete process.env.KITTY_WINDOW_ID;
		delete process.env.KITTY_PID;
		delete process.env.LC_TERMINAL;
		delete process.env.GHOSTTY_RESOURCES_DIR;
		delete process.env.WEZTERM_EXECUTABLE;
		delete process.env.WEZTERM_CONFIG_DIR;
		delete process.env.WEZTERM_CONFIG_FILE;
		delete process.env.COLORTERM;
		__imageInternals.resetCachesForTests();
	});

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

describe(isTmuxSession, () => {
	it("detects tmux from env", () => {
		process.env.TMUX = "/tmp/tmux-1000/default,1234,0";
		expect(isTmuxSession()).toBeTruthy();
		delete process.env.TMUX;
	});

	it("detects screen from TERM", () => {
		process.env.TERM = "screen-256color";
		expect(isTmuxSession()).toBeTruthy();
		delete process.env.TERM;
	});
});

describe("tmux passthrough helpers", () => {
	it("returns null when not in tmux", () => {
		delete process.env.TMUX;
		const warning = getTmuxPassthroughWarning("kitty");
		expect(warning).toBeNull();
	});
});
