import { icon } from "./icons.js";
import type { ModelCapabilities } from "./types.js";

/** Model capability lookup table — maps model IDs to their context window, output limits, and features. */
export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
	// Anthropic
	"claude-sonnet-4-20250514": { contextWindow: 200000, input: ["text", "image"], maxTokens: 16384, reasoning: true },
	"claude-opus-4-0520": { contextWindow: 200000, input: ["text", "image"], maxTokens: 16384, reasoning: true },
	// OpenAI
	"gpt-4o": { contextWindow: 128000, input: ["text", "image"], maxTokens: 16384, reasoning: false },
	"o3-mini": { contextWindow: 128000, input: ["text"], maxTokens: 65536, reasoning: true },
	// Google
	"gemini-2.5-pro": { contextWindow: 1048576, input: ["text", "image"], maxTokens: 65536, reasoning: true },
	"gemini-2.5-flash": { contextWindow: 1048576, input: ["text", "image"], maxTokens: 65536, reasoning: true },
	// Groq
	"llama-3.3-70b-versatile": { contextWindow: 128000, input: ["text"], maxTokens: 32768, reasoning: false },
	// OpenRouter
	"anthropic/claude-sonnet-4": { contextWindow: 200000, input: ["text", "image"], maxTokens: 16384, reasoning: true },
	"openai/gpt-4o": { contextWindow: 128000, input: ["text", "image"], maxTokens: 16384, reasoning: false },
	// XAI
	"grok-3": { contextWindow: 131072, input: ["text", "image"], maxTokens: 16384, reasoning: false },
	// Mistral
	"mistral-large-latest": { contextWindow: 128000, input: ["text"], maxTokens: 8192, reasoning: false },
};

/** Provider registry — maps provider names to their env var, label, and available models. */
export const PROVIDERS: Record<string, { env: string; label: string; models: string[] }> = {
	anthropic: {
		env: "ANTHROPIC_API_KEY",
		label: "Anthropic (Claude)",
		models: [
			"claude-sonnet-4-20250514",
			"claude-sonnet-4-5-20250929",
			"claude-opus-4-20250514",
			"claude-haiku-4-5-20251001",
		],
	},
	google: { env: "GEMINI_API_KEY", label: "Google Gemini", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
	groq: { env: "GROQ_API_KEY", label: "Groq (Free, Fast)", models: ["llama-3.3-70b-versatile"] },
	mistral: { env: "MISTRAL_API_KEY", label: "Mistral", models: ["mistral-large-latest"] },
	openai: { env: "OPENAI_API_KEY", label: "OpenAI (GPT)", models: ["gpt-4o", "o3-mini"] },
	openrouter: {
		env: "OPENROUTER_API_KEY",
		label: "OpenRouter (Multi)",
		models: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
	},
	xai: { env: "XAI_API_KEY", label: "xAI (Grok)", models: ["grok-3"] },
};

/** Available themes — each has a name, display label, and light/dark style. */
export const THEMES = [
	{ label: "Pi Default Dark", name: "dark", style: "dark" },
	{ label: "oh-pi Dark (Cyan+Purple)", name: "oh-p-dark", style: "dark" },
	{ label: "Cyberpunk (Neon)", name: "cyberpunk", style: "dark" },
	{ label: "Nord (Arctic)", name: "nord", style: "dark" },
	{ label: "Catppuccin Mocha (Pastel)", name: "catppuccin-mocha", style: "dark" },
	{ label: "Tokyo Night (Blue+Purple)", name: "tokyo-night", style: "dark" },
	{ label: "Gruvbox Dark (Warm)", name: "gruvbox-dark", style: "dark" },
	{ label: "Pi Default Light", name: "light", style: "light" },
];

/** Available extensions — each has a name, label function, and whether it's enabled by default. */
export const EXTENSIONS = [
	{
		default: true,
		get label() {
			return `${icon("package")} Git Guard — Auto stash checkpoint + dirty repo warning + notify`;
		},
		name: "git-guard",
	},
	{
		default: true,
		get label() {
			return `${icon("memo")} Auto Session Name — Dynamic session naming + compact auto-continue`;
		},
		name: "auto-session-name",
	},
	{
		default: true,
		get label() {
			return `${icon("chart")} Custom Footer — Enhanced status bar with tokens, cost, time, git, cwd`;
		},
		name: "custom-footer",
	},
	{
		default: true,
		get label() {
			return `${icon("clock")} Tool Metadata — Add completion timestamps, durations, and context snapshots to tool results`;
		},
		name: "tool-metadata",
	},
	{
		default: true,
		get label() {
			return `${icon("chart")} Diagnostics — Log prompt completion timestamps, durations, and per-turn response timing`;
		},
		name: "diagnostics",
	},
	{
		default: true,
		get label() {
			return `${icon("bolt")} Compact Header — Dense startup info replacing verbose output`;
		},
		name: "compact-header",
	},
	{
		default: false,
		get label() {
			return `${icon("ant")} Ant Colony — Autonomous multi-agent swarm with adaptive concurrency`;
		},
		name: "ant-colony",
	},
	{
		default: false,
		get label() {
			return `${icon("map")} Plan Mode — Branch-aware planning and delegated research via /plan`;
		},
		name: "plan",
	},
	{
		default: false,
		get label() {
			return `${icon("spec")} Spec Workflow — Native spec-driven planning and implementation via /spec`;
		},
		name: "spec",
	},
	{
		default: true,
		get label() {
			return `${icon("update")} Auto Update — Check for oh-pi updates on startup and notify`;
		},
		name: "auto-update",
	},
	{
		default: false,
		get label() {
			return `${icon("clock")} Bg Process — Auto-background long-running commands (dev servers, etc.)`;
		},
		name: "bg-process",
	},
	{
		default: false,
		get label() {
			return `${icon("cost")} Usage Tracker — Real-time per-model token & cost monitoring with /usage command`;
		},
		name: "usage-tracker",
	},
	{
		default: true,
		get label() {
			return `${icon("package")} Worktree — Centralized pi-owned git worktree status and cleanup`;
		},
		name: "worktree",
	},
];

/** Keybinding schemes — default (no overrides), vim-style, and emacs-style. */
export const KEYBINDING_SCHEMES: Record<string, object> = {
	default: {},
	emacs: {
		cursorDown: ["down", "ctrl+n"],
		cursorLeft: ["left", "ctrl+b"],
		cursorLineEnd: ["end", "ctrl+e"],
		cursorLineStart: ["home", "ctrl+a"],
		cursorRight: ["right", "ctrl+f"],
		cursorUp: ["up", "ctrl+p"],
		cursorWordLeft: ["alt+left", "alt+b"],
		cursorWordRight: ["alt+right", "alt+f"],
		deleteCharBackward: ["backspace", "ctrl+h"],
		deleteCharForward: ["delete", "ctrl+d"],
		newLine: ["shift+enter", "ctrl+j"],
	},
	vim: {
		cursorDown: ["down", "alt+j"],
		cursorLeft: ["left", "alt+h"],
		cursorRight: ["right", "alt+l"],
		cursorUp: ["up", "alt+k"],
		cursorWordLeft: ["alt+left", "alt+b"],
		cursorWordRight: ["alt+right", "alt+w"],
	},
};
