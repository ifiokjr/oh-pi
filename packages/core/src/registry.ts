import { icon } from "./icons.js";
import type { ModelCapabilities } from "./types.js";

/** Model capability lookup table — maps model IDs to their context window, output limits, and features. */
export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
	// Anthropic
	"claude-sonnet-4-20250514": { contextWindow: 200000, maxTokens: 16384, reasoning: true, input: ["text", "image"] },
	"claude-opus-4-0520": { contextWindow: 200000, maxTokens: 16384, reasoning: true, input: ["text", "image"] },
	// OpenAI
	"gpt-4o": { contextWindow: 128000, maxTokens: 16384, reasoning: false, input: ["text", "image"] },
	"o3-mini": { contextWindow: 128000, maxTokens: 65536, reasoning: true, input: ["text"] },
	// Google
	"gemini-2.5-pro": { contextWindow: 1048576, maxTokens: 65536, reasoning: true, input: ["text", "image"] },
	"gemini-2.5-flash": { contextWindow: 1048576, maxTokens: 65536, reasoning: true, input: ["text", "image"] },
	// Groq
	"llama-3.3-70b-versatile": { contextWindow: 128000, maxTokens: 32768, reasoning: false, input: ["text"] },
	// OpenRouter
	"anthropic/claude-sonnet-4": { contextWindow: 200000, maxTokens: 16384, reasoning: true, input: ["text", "image"] },
	"openai/gpt-4o": { contextWindow: 128000, maxTokens: 16384, reasoning: false, input: ["text", "image"] },
	// xAI
	"grok-3": { contextWindow: 131072, maxTokens: 16384, reasoning: false, input: ["text", "image"] },
	// Mistral
	"mistral-large-latest": { contextWindow: 128000, maxTokens: 8192, reasoning: false, input: ["text"] },
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
	openai: { env: "OPENAI_API_KEY", label: "OpenAI (GPT)", models: ["gpt-4o", "o3-mini"] },
	google: { env: "GEMINI_API_KEY", label: "Google Gemini", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
	groq: { env: "GROQ_API_KEY", label: "Groq (Free, Fast)", models: ["llama-3.3-70b-versatile"] },
	openrouter: {
		env: "OPENROUTER_API_KEY",
		label: "OpenRouter (Multi)",
		models: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
	},
	xai: { env: "XAI_API_KEY", label: "xAI (Grok)", models: ["grok-3"] },
	mistral: { env: "MISTRAL_API_KEY", label: "Mistral", models: ["mistral-large-latest"] },
};

/** Available themes — each has a name, display label, and light/dark style. */
export const THEMES = [
	{ name: "dark", label: "Pi Default Dark", style: "dark" },
	{ name: "oh-p-dark", label: "oh-pi Dark (Cyan+Purple)", style: "dark" },
	{ name: "cyberpunk", label: "Cyberpunk (Neon)", style: "dark" },
	{ name: "nord", label: "Nord (Arctic)", style: "dark" },
	{ name: "catppuccin-mocha", label: "Catppuccin Mocha (Pastel)", style: "dark" },
	{ name: "tokyo-night", label: "Tokyo Night (Blue+Purple)", style: "dark" },
	{ name: "gruvbox-dark", label: "Gruvbox Dark (Warm)", style: "dark" },
	{ name: "light", label: "Pi Default Light", style: "light" },
];

/** Available extensions — each has a name, label function, and whether it's enabled by default. */
export const EXTENSIONS = [
	{
		name: "safe-guard",
		get label() {
			return `${icon("shield")}  Safe Guard — Dangerous command confirm + path protection`;
		},
		default: false,
	},
	{
		name: "git-guard",
		get label() {
			return `${icon("package")} Git Guard — Auto stash checkpoint + dirty repo warning + notify`;
		},
		default: true,
	},
	{
		name: "auto-session-name",
		get label() {
			return `${icon("memo")} Auto Session Name — Dynamic session naming + compact auto-continue`;
		},
		default: true,
	},
	{
		name: "custom-footer",
		get label() {
			return `${icon("chart")} Custom Footer — Enhanced status bar with tokens, cost, time, git, cwd`;
		},
		default: true,
	},
	{
		name: "tool-metadata",
		get label() {
			return `${icon("clock")} Tool Metadata — Add completion timestamps, durations, and context snapshots to tool results`;
		},
		default: true,
	},
	{
		name: "compact-header",
		get label() {
			return `${icon("bolt")} Compact Header — Dense startup info replacing verbose output`;
		},
		default: true,
	},
	{
		name: "ant-colony",
		get label() {
			return `${icon("ant")} Ant Colony — Autonomous multi-agent swarm with adaptive concurrency`;
		},
		default: false,
	},
	{
		name: "plan",
		get label() {
			return `${icon("map")} Plan Mode — Branch-aware planning and delegated research via /plan`;
		},
		default: false,
	},
	{
		name: "spec",
		get label() {
			return `${icon("spec")} Spec Workflow — Native spec-driven planning and implementation via /spec`;
		},
		default: false,
	},
	{
		name: "auto-update",
		get label() {
			return `${icon("update")} Auto Update — Check for oh-pi updates on startup and notify`;
		},
		default: true,
	},
	{
		name: "bg-process",
		get label() {
			return `${icon("clock")} Bg Process — Auto-background long-running commands (dev servers, etc.)`;
		},
		default: false,
	},
	{
		name: "usage-tracker",
		get label() {
			return `${icon("cost")} Usage Tracker — Real-time per-model token & cost monitoring with /usage command`;
		},
		default: false,
	},
];

/** Keybinding schemes — default (no overrides), vim-style, and emacs-style. */
export const KEYBINDING_SCHEMES: Record<string, object> = {
	default: {},
	vim: {
		cursorUp: ["up", "alt+k"],
		cursorDown: ["down", "alt+j"],
		cursorLeft: ["left", "alt+h"],
		cursorRight: ["right", "alt+l"],
		cursorWordLeft: ["alt+left", "alt+b"],
		cursorWordRight: ["alt+right", "alt+w"],
	},
	emacs: {
		cursorUp: ["up", "ctrl+p"],
		cursorDown: ["down", "ctrl+n"],
		cursorLeft: ["left", "ctrl+b"],
		cursorRight: ["right", "ctrl+f"],
		cursorWordLeft: ["alt+left", "alt+b"],
		cursorWordRight: ["alt+right", "alt+f"],
		deleteCharForward: ["delete", "ctrl+d"],
		deleteCharBackward: ["backspace", "ctrl+h"],
		cursorLineStart: ["home", "ctrl+a"],
		cursorLineEnd: ["end", "ctrl+e"],
		newLine: ["shift+enter", "ctrl+j"],
	},
};
