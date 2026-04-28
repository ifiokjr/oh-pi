// Base ANSI codes
export let RST = "\x1B[0m";
export const BOLD = "\x1B[1m";

export const FG_LNUM = "\x1B[38;2;100;100;100m";
export const FG_DIM = "\x1B[38;2;80;80;80m";
export const FG_RULE = "\x1B[38;2;50;50;50m";
export const FG_GREEN = "\x1B[38;2;100;180;120m";
export const FG_RED = "\x1B[38;2;200;100;100m";
export const FG_YELLOW = "\x1B[38;2;220;180;80m";
export const FG_BLUE = "\x1B[38;2;100;140;220m";
export const FG_MUTED = "\x1B[38;2;139;148;158m";

export const BG_DEFAULT = "\x1B[49m";
export let BG_BASE = BG_DEFAULT;
export let BG_ERROR = BG_DEFAULT;

export function envInt(name: string, fallback: number): number {
	const v = Number.parseInt(process.env[name] ?? "", 10);
	return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function strip(s: string): string {
	return s.replaceAll(/\u001B\[[0-9;]*m/g, "");
}

/** Parse an ANSI 24-bit color escape into { r, g, b }. */
export function parseAnsiRgb(ansi: string): { r: number; g: number; b: number } | null {
	const m = ansi.match(/\u001B\[(?:38|48);2;(\d+);(\d+);(\d+)m/);
	return m ? { b: +m[3], g: +m[2], r: +m[1] } : null;
}

export function resolveBaseBackground(theme: { getBgAnsi?: (key: string) => string } | null | undefined): void {
	if (!theme?.getBgAnsi) {
		return;
	}
	try {
		const success = theme.getBgAnsi("toolSuccessBg");
		const error = theme.getBgAnsi("toolErrorBg");
		if (success && parseAnsiRgb(success)) {
			BG_BASE = success;
		}
		if (error && parseAnsiRgb(error)) {
			BG_ERROR = error;
		}
		RST = `\u001b[0m${BG_BASE}`;
	} catch {}
}

export function preserveToolBackground(ansi: string, bg = BG_BASE): string {
	return ansi.replaceAll(/\u001B\[([0-9;]*)m/g, (seq, params: string) => {
		const codes = params.split(";");
		return params === "0" || codes.includes("49") ? `${seq}${bg}` : seq;
	});
}

export function fillToolBackground(text: string, bg = BG_BASE): string {
	const width = termW();
	return text
		.split("\n")
		.map((line) => {
			const normalized = preserveToolBackground(line, bg);
			const padding = Math.max(0, width - strip(normalized).length);
			return `${bg}${normalized}${" ".repeat(padding)}${RST}`;
		})
		.join("\n");
}

export function termW(): number {
	const stderrWithColumns = process.stderr as NodeJS.WriteStream & {
		columns?: number;
	};
	const raw =
		process.stdout.columns || stderrWithColumns.columns || Number.parseInt(process.env.COLUMNS ?? "", 10) || 200;
	return Math.max(80, Math.min(raw - 4, 210));
}

/** Low-contrast fix: replace dark Shiki foregrounds with muted color. */
export function isLowContrastShikiFg(params: string): boolean {
	if (params === "30" || params === "90") {
		return true;
	}
	if (params === "38;5;0" || params === "38;5;8") {
		return true;
	}
	if (!params.startsWith("38;2;")) {
		return false;
	}
	const parts = params.split(";").map(Number);
	if (parts.length !== 5 || parts.some((n) => !Number.isFinite(n))) {
		return false;
	}
	const [, , r, g, b] = parts;
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return luminance < 72;
}

export function normalizeShikiContrast(ansi: string): string {
	return ansi.replaceAll(/\u001B\[([0-9;]*)m/g, (seq, params: string) =>
		isLowContrastShikiFg(params) ? FG_MUTED : seq,
	);
}

export function lnum(n: number, w: number): string {
	const v = String(n);
	return `${FG_LNUM}${" ".repeat(Math.max(0, w - v.length))}${v}${RST}`;
}

export function rule(w: number): string {
	return `${FG_RULE}${"─".repeat(w)}${RST}`;
}
