import { describe, expect, it } from "vitest";
import { EXTENSIONS, KEYBINDING_SCHEMES, MODEL_CAPABILITIES, PROVIDERS, THEMES } from "./registry.js";

describe("MODEL_CAPABILITIES", () => {
	it("has entries", () => {
		expect(Object.keys(MODEL_CAPABILITIES).length).toBeGreaterThan(0);
	});

	it("each entry has required fields", () => {
		for (const [, cap] of Object.entries(MODEL_CAPABILITIES)) {
			expect(cap).toHaveProperty("contextWindow");
			expect(cap).toHaveProperty("maxTokens");
			expect(cap).toHaveProperty("reasoning");
			expect(cap).toHaveProperty("input");
			expect(cap.contextWindow).toBeGreaterThan(0);
			expect(cap.maxTokens).toBeGreaterThan(0);
		}
	});
});

describe("PROVIDERS", () => {
	const expected = ["anthropic", "openai", "google", "groq", "openrouter", "xai", "mistral"];

	it("has 7 providers", () => {
		expect(Object.keys(PROVIDERS)).toHaveLength(7);
	});

	it("contains all expected providers", () => {
		for (const name of expected) {
			expect(PROVIDERS).toHaveProperty(name);
		}
	});

	it("each provider has env/label/models", () => {
		for (const [, info] of Object.entries(PROVIDERS)) {
			expect(info.env).toMatch(/_API_KEY$|_KEY$/);
			expect(info.label).toBeTruthy();
			expect(Array.isArray(info.models)).toBe(true);
		}
	});
});

describe("THEMES", () => {
	it("is array with entries", () => {
		expect(Array.isArray(THEMES)).toBe(true);
		expect(THEMES.length).toBeGreaterThan(0);
	});

	it("each has name/label/style", () => {
		for (const theme of THEMES) {
			expect(theme).toHaveProperty("name");
			expect(theme).toHaveProperty("label");
			expect(theme).toHaveProperty("style");
		}
	});
});

describe("EXTENSIONS", () => {
	it("is array with entries", () => {
		expect(Array.isArray(EXTENSIONS)).toBe(true);
		expect(EXTENSIONS.length).toBeGreaterThan(0);
	});

	it("each has name/label/default", () => {
		for (const ext of EXTENSIONS) {
			expect(ext).toHaveProperty("name");
			expect(ext).toHaveProperty("label");
			expect(ext).toHaveProperty("default");
		}
	});

	it("exposes the optional plan mode extension", () => {
		const plan = EXTENSIONS.find((ext) => ext.name === "plan");
		expect(plan).toBeDefined();
		expect(plan?.default).toBe(false);
	});

	it("exposes the optional spec workflow extension", () => {
		const spec = EXTENSIONS.find((ext) => ext.name === "spec");
		expect(spec).toBeDefined();
		expect(spec?.default).toBe(false);
	});

	it("enables tool metadata by default", () => {
		const toolMetadata = EXTENSIONS.find((ext) => ext.name === "tool-metadata");
		expect(toolMetadata).toBeDefined();
		expect(toolMetadata?.default).toBe(true);
	});
});

describe("KEYBINDING_SCHEMES", () => {
	it("has default/vim/emacs", () => {
		expect(KEYBINDING_SCHEMES).toHaveProperty("default");
		expect(KEYBINDING_SCHEMES).toHaveProperty("vim");
		expect(KEYBINDING_SCHEMES).toHaveProperty("emacs");
	});
});
