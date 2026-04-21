import { extname, basename } from "node:path";

// Nerd Font icon mapping — hoisted module scope (performance rule #1)
const ICON_MAP: Record<string, string> = {
	".ts": "󰛦",
	".tsx": "󰛦",
	".js": "󰌞",
	".jsx": "󰌞",
	".json": "󰘦",
	".md": "󰍔",
	".mdx": "󰍔",
	".py": "󰌠",
	".rs": "󱘗",
	".go": "󰟓",
	".java": "󰬷",
	".c": "󰙱",
	".cpp": "󰙲",
	".h": "󰙱",
	".hpp": "󰙲",
	".cs": "󰌛",
	".swift": "󰛥",
	".kt": "󰌉",
	".html": "󰌝",
	".css": "󰌜",
	".scss": "󰌜",
	".less": "󰌜",
	".yaml": "󰢩",
	".yml": "󰢩",
	".toml": "󰲴",
	".sh": "󰆍",
	".bash": "󰆍",
	".zsh": "󰆍",
	".lua": "󰢱",
	".php": "󰌟",
	".dart": "󰚨",
	".xml": "󰗀",
	".graphql": "󰡷",
	".svelte": "󰚗",
	".vue": "󰡄",
	".dockerfile": "󰡨",
	".makefile": "󰡱",
	".zig": "󰡷",
	".nim": "󰘨",
	".rb": "󰴽",
	".sql": "󰡮",
	".dockerignore": "󰡨",
	".gitignore": "󰊢",
	".git": "󰊢",
	"LICENSE": "󰿃",
	"README": "󰂺",
};

const DIRECTORY_ICON = "󰉋";
const GENERIC_FILE_ICON = "󰈙";

let ICONS_ENABLED = process.env.PRETTY_ICONS !== "none";

export function getFileIcon(name: string): string {
	if (!ICONS_ENABLED) return "";
	const lower = name.toLowerCase();
	if (ICON_MAP[lower]) return `${ICON_MAP[lower]} `;
	const ext = extname(name).toLowerCase();
	if (ICON_MAP[ext]) return `${ICON_MAP[ext]} `;
	return `${GENERIC_FILE_ICON} `;
}

export function getDirectoryIcon(): string {
	if (!ICONS_ENABLED) return "";
	return `${DIRECTORY_ICON} `;
}

export function enableIcons(enabled: boolean): void {
	ICONS_ENABLED = enabled;
}

export function areIconsEnabled(): boolean {
	return ICONS_ENABLED;
}