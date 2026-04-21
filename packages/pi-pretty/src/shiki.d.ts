// Type declarations for optional dependencies

declare module "@shikijs/cli" {
	import type { BundledLanguage, BundledTheme } from "shiki";
	export function codeToANSI(code: string, lang: BundledLanguage, theme: BundledTheme): Promise<string>;
}

declare module "shiki" {
	export type BundledLanguage = string;
	export type BundledTheme = string;
}
