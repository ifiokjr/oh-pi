import { basename, extname } from "node:path";

// Nerd Font icon mapping — hoisted module scope (performance rule #1)
const ICON_MAP: Record<string, string> = {
	".bash": "󰆍",
	".c": "󰙱",
	".cpp": "󰙲",
	".cs": "󰌛",
	".css": "󰌜",
	".dart": "󰚨",
	".dockerfile": "󰡨",
	".dockerignore": "󰡨",
	".git": "󰊢",
	".gitignore": "󰊢",
	".go": "󰟓",
	".graphql": "󰡷",
	".h": "󰙱",
	".hpp": "󰙲",
	".html": "󰌝",
	".java": "󰬷",
	".js": "󰌞",
	".json": "󰘦",
	".jsx": "󰌞",
	".kt": "󰌉",
	".less": "󰌜",
	".lua": "󰢱",
	".makefile": "󰡱",
	".md": "󰍔",
	".mdx": "󰍔",
	".nim": "󰘨",
	".php": "󰌟",
	".py": "󰌠",
	".rb": "󰴽",
	".rs": "󱘗",
	".scss": "󰌜",
	".sh": "󰆍",
	".sql": "󰡮",
	".svelte": "󰚗",
	".swift": "󰛥",
	".toml": "󰲴",
	".ts": "󰛦",
	".tsx": "󰛦",
	".vue": "󰡄",
	".xml": "󰗀",
	".yaml": "󰢩",
	".yml": "󰢩",
	".zig": "󰡷",
	".zsh": "󰆍",
	LICENSE: "󰿃",
	README: "󰂺",
};

const DIRECTORY_ICON = "󰉋";
const GENERIC_FILE_ICON = "󰈙";

let ICONS_ENABLED = process.env.PRETTY_ICONS !== "none";

export function getFileIcon(name: string): string {
	if (!ICONS_ENABLED) {
		return "";
	}
	const lower = name.toLowerCase();
	if (ICON_MAP[lower]) {
		return `${ICON_MAP[lower]} `;
	}
	const ext = extname(name).toLowerCase();
	if (ICON_MAP[ext]) {
		return `${ICON_MAP[ext]} `;
	}
	return `${GENERIC_FILE_ICON} `;
}

export function getDirectoryIcon(): string {
	if (!ICONS_ENABLED) {
		return "";
	}
	return `${DIRECTORY_ICON} `;
}

export function enableIcons(enabled: boolean): void {
	ICONS_ENABLED = enabled;
}

export function areIconsEnabled(): boolean {
	return ICONS_ENABLED;
}
