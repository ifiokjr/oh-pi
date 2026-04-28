/**
 * Utility Functions
 *
 * Common utilities for formatting, styling, and data manipulation.
 */

import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with proper precedence
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

/**
 * Format number with locale separators
 */
export function formatNumber(num: number, decimals = 0): string {
	if (num === 0) {
		return "0";
	}
	if (Number.isNaN(num)) {
		return "—";
	}

	const absNum = Math.abs(num);

	// Large numbers
	if (absNum >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(decimals)}M`;
	}
	if (absNum >= 1000) {
		return `${(num / 1000).toFixed(decimals)}k`;
	}

	return num.toLocaleString("en-US", {
		maximumFractionDigits: decimals,
		minimumFractionDigits: decimals,
	});
}

/**
 * Format currency (USD by default)
 */
export function formatCurrency(amount: number, currency = "USD", compact = false): string {
	if (Number.isNaN(amount)) {
		return "—";
	}

	const absAmount = Math.abs(amount);
	const sign = amount < 0 ? "-" : "";

	if (compact) {
		if (absAmount >= 1000) {
			return `${sign}$${(absAmount / 1000).toFixed(1)}k`;
		}
		if (absAmount >= 1) {
			return `${sign}$${absAmount.toFixed(2)}`;
		}
		return `${sign}$${absAmount.toFixed(4)}`;
	}

	return new Intl.NumberFormat("en-US", {
		currency,
		maximumFractionDigits: 4,
		minimumFractionDigits: absAmount < 1 ? 4 : 2,
		style: "currency",
	}).format(amount);
}

/**
 * Format tokens with appropriate units
 */
export function formatTokens(tokens: number): string {
	if (tokens === 0) {
		return "0";
	}
	if (Number.isNaN(tokens)) {
		return "—";
	}

	const abs = Math.abs(tokens);
	if (abs >= 1_000_000) {
		return `${(tokens / 1_000_000).toFixed(2)}M`;
	}
	if (abs >= 1000) {
		return `${(tokens / 1000).toFixed(1)}k`;
	}
	return tokens.toLocaleString();
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms.toFixed(0)}ms`;
	}
	if (ms < 60_000) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	if (ms < 3_600_000) {
		return `${(ms / 60000).toFixed(1)}m`;
	}
	return `${(ms / 3_600_000).toFixed(1)}h`;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string | number, format: "short" | "medium" | "long" = "medium"): string {
	const d = new Date(date);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	// Relative dates for recent
	if (diffDays < 1 && d.getDate() === now.getDate()) {
		return "Today";
	}
	if (diffDays < 2) {
		return "Yesterday";
	}
	if (diffDays < 7) {
		return `${diffDays} days ago`;
	}

	const options: Intl.DateTimeFormatOptions = {
		short: { day: "numeric", month: "short" },
		/* C8 ignore next -- ternary branch is covered in behavior tests but may report partial on this line */
		medium: {
			day: "numeric",
			month: "short",
			year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
		},
		long: { day: "numeric", month: "long", weekday: "long", year: "numeric" },
	}[format];

	return d.toLocaleDateString("en-US", options);
}

/**
 * Format time range
 */
export function formatTimeRange(start: Date | string, end: Date | string): string {
	const s = new Date(start);
	const e = new Date(end);
	const duration = e.getTime() - s.getTime();

	if (duration < 60_000) {
		return `${formatDuration(duration)} session`;
	}

	const startTime = s.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
	});
	const endTime = e.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
	});

	return `${startTime} - ${endTime}`;
}

/**
 * Generate color from string (for charts)
 */
export function stringToColor(str: string, index = 0): string {
	const colors = [
		"#6366f1", // Indigo
		"#8b5cf6", // Purple
		"#06b6d4", // Cyan
		"#10b981", // Emerald
		"#f59e0b", // Amber
		"#ef4444", // Red
		"#ec4899", // Pink
		"#84cc16", // Lime
		"#3b82f6", // Blue
		"#14b8a6", // Teal
		"#f97316", // Orange
		"#8b5a2b", // Brown
		"#6b7280", // Gray
	];

	// Use index if provided, otherwise hash the string
	if (index > 0) {
		return colors[index % colors.length];
	}

	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = str.codePointAt(i) + ((hash << 5) - hash);
	}
	return colors[Math.abs(hash) % colors.length];
}

/**
 * Get chart color palette
 */
export function getChartColors(count: number): string[] {
	const baseColors = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#84cc16"];

	if (count <= baseColors.length) {
		return baseColors.slice(0, count);
	}

	// Generate additional colors by mixing
	const colors = [...baseColors];
	while (colors.length < count) {
		const i = colors.length % baseColors.length;
		const base = baseColors[i];
		const opacity = 0.7 - (colors.length - baseColors.length) * 0.1;
		colors.push(
			base +
				Math.round(opacity * 255)
					.toString(16)
					.padStart(2, "0"),
		);
	}

	return colors;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) {
		return str;
	}
	return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(providerId: string): string {
	const names: Record<string, string> = {
		anthropic: "Anthropic",
		google: "Google",
		ollama: "Ollama",
		openai: "OpenAI",
	};
	return names[providerId] ?? providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

/**
 * Get model short name
 */
export function getModelShortName(modelId: string): string {
	// Remove organization prefix and version
	const short = modelId
		.replace(/^(anthropic\/|openai\/|google\/|ollama\/)/, "")
		.replace(/-\d{4}-\d{2}-\d{2}$/, "")
		.replace(/-latest$/, "");

	return truncate(short, 25);
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: number, total: number): number {
	if (total === 0) {
		return 0;
	}
	return Math.round((value / total) * 100);
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
	fn: T,
	delay: number,
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout>;
	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delay);
	};
}

/**
 * Deep compare two objects
 */
export function isEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Parse JSON safely
 */
export function safeJsonParse<T>(json: string | null, fallback: T): T {
	if (!json) {
		return fallback;
	}
	try {
		return JSON.parse(json) as T;
	} catch {
		return fallback;
	}
}
