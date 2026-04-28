import * as p from "@clack/prompts";
import { execSync } from "node:child_process";
import { messages } from "./locales.js";
import type { Locale } from "./types.js";

export type { Locale } from "./types.js";

let current: Locale = "en";

/**
 * Get a translated string for the current locale, with optional variable interpolation.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
	let text = messages[current]?.[key] ?? messages.en[key] ?? key;
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			text = text.replace(`{${k}}`, String(v));
		}
	}

	return text;
}

/** Set the current locale. */
export function setLocale(locale: Locale) {
	current = locale;
}

/** Get the current locale. */
export function getLocale(): Locale {
	return current;
}

/** Detect the user's locale from environment variables. */
function detectLocale(): Locale | undefined {
	let lang = (process.env.LANG ?? process.env.LC_ALL ?? process.env.LANGUAGE ?? "").toLowerCase();

	if (!lang && process.platform === "win32") {
		try {
			lang = execSync('powershell -NoProfile -Command "(Get-Culture).Name"', {
				encoding: "utf8",
				timeout: 3000,
			})
				.trim()
				.toLowerCase();
		} catch {
			/* Ignore */
		}
	}

	if (lang.startsWith("fr")) {
		return "fr";
	}

	if (lang.startsWith("en")) {
		return "en";
	}

	return undefined;
}

/** Prompt the user to select a language. Auto-detects from environment if possible, otherwise shows an interactive selector. */
export async function selectLanguage(): Promise<Locale> {
	const detected = detectLocale();
	if (detected) {
		setLocale(detected);
		return detected;
	}

	const locale = await p.select({
		message: "Language / Langue:",
		options: [
			{ label: "English", value: "en" as Locale },
			{ label: "Français", value: "fr" as Locale },
		],
	});
	if (p.isCancel(locale)) {
		p.cancel("Cancelled.");
		process.exit(0);
	}

	setLocale(locale);
	return locale;
}
