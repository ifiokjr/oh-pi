/**
 * Centralized icon registry with emoji and plain-text (ASCII) variants.
 *
 * When plain icon mode is enabled (via `OH_PI_PLAIN_ICONS=1` environment
 * variable or `plainIcons: true` in settings.json), all icon lookups return
 * ASCII-safe equivalents that render correctly in any terminal regardless
 * of font or Unicode support.
 *
 * @see https://github.com/ifiokjr/oh-pi/issues/24
 */

/** The two icon rendering modes. */
export type IconMode = "emoji" | "plain";

/** Check whether plain icon mode is active. */
export function isPlainIcons(): boolean {
	return process.env.OH_PI_PLAIN_ICONS === "1" || process.env.OH_PI_PLAIN_ICONS === "true";
}

/** Set plain icon mode via environment variable. */
export function setPlainIcons(enabled: boolean): void {
	if (enabled) {
		process.env.OH_PI_PLAIN_ICONS = "1";
	} else {
		process.env.OH_PI_PLAIN_ICONS = "";
	}
}

/** All known icon names used across oh-pi packages. */
export type IconName =
	| "ant"
	| "bolt"
	| "budget"
	| "cancel"
	| "chart"
	| "check"
	| "circle"
	| "clock"
	| "colony"
	| "cost"
	| "cross"
	| "custom"
	| "drone"
	| "error"
	| "gear"
	| "hammer"
	| "info"
	| "keyboard"
	| "list"
	| "lock"
	| "map"
	| "memo"
	| "package"
	| "pause"
	| "pencil"
	| "plus"
	| "recycle"
	| "robot"
	| "rocket"
	| "running"
	| "scaffold"
	| "scope"
	| "search"
	| "shield"
	| "skip"
	| "sparkle"
	| "spec"
	| "star"
	| "unchecked"
	| "update"
	| "vim"
	| "emacs"
	| "warning"
	| "wrench";

const EMOJI_ICONS: Record<IconName, string> = {
	ant: "🐜",
	bolt: "⚡",
	budget: "💰",
	cancel: "✖",
	chart: "📊",
	check: "✓",
	circle: "⚫",
	clock: "⏳",
	colony: "🐜",
	cost: "💰",
	cross: "✗",
	custom: "🎛️",
	drone: "⚙️",
	emacs: "🔵",
	error: "❌",
	gear: "⚙️",
	hammer: "⚒️",
	info: "ℹ️",
	keyboard: "⌨️",
	list: "📋",
	lock: "🔒",
	map: "🗺️",
	memo: "📝",
	package: "📦",
	pause: "⏸",
	pencil: "📝",
	plus: "➕",
	recycle: "♻️",
	robot: "🤖",
	rocket: "🚀",
	running: "🟢",
	scaffold: "🏗️",
	scope: "📐",
	search: "🔍",
	shield: "🛡️",
	skip: "⏭",
	sparkle: "✨",
	spec: "📐",
	star: "⭐",
	unchecked: "⬜",
	update: "🔄",
	vim: "🟢",
	warning: "⚠️",
	wrench: "🔧",
};

const PLAIN_ICONS: Record<IconName, string> = {
	ant: "[ant]",
	bolt: "[!]",
	budget: "[$]",
	cancel: "[x]",
	chart: "[~]",
	check: "[ok]",
	circle: "[*]",
	clock: "[..]",
	colony: "[ant]",
	cost: "[$]",
	cross: "[x]",
	custom: "[=]",
	drone: "[d]",
	emacs: "[e]",
	error: "[ERR]",
	gear: "[*]",
	hammer: "[w]",
	info: "[i]",
	keyboard: "[kb]",
	list: "[#]",
	lock: "[!]",
	map: "[m]",
	memo: "[>]",
	package: "[+]",
	pause: "[||]",
	pencil: "[>]",
	plus: "[+]",
	recycle: "[~]",
	robot: "[ai]",
	rocket: "[>>]",
	running: "[ok]",
	scaffold: "[^]",
	scope: "[:]",
	search: "[?]",
	shield: "[!]",
	skip: "[>>]",
	sparkle: "[*]",
	spec: "[:]",
	star: "[*]",
	unchecked: "[ ]",
	update: "[~]",
	vim: "[v]",
	warning: "[!]",
	wrench: "[#]",
};

/**
 * Look up an icon by name, returning either an emoji or plain-text variant
 * depending on the `OH_PI_PLAIN_ICONS` environment variable.
 *
 * @param name - The icon name (e.g. `"check"`, `"rocket"`, `"ant"`)
 * @returns The icon string for the current mode
 */
export function icon(name: IconName): string {
	return isPlainIcons() ? PLAIN_ICONS[name] : EMOJI_ICONS[name];
}
