import { describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", () => ({
	getMarkdownTheme: () => ({}),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Container: class {},
	Markdown: class {},
	Spacer: class {},
	Text: class {
		constructor(public text: string) {}
	},
	truncateToWidth: (text: string, width: number) => text.slice(0, width),
	visibleWidth: (text: string) => text.length,
}));

vi.mock("../formatters.js", () => ({
	formatTokens: (value: number) => `${value}`,
	formatUsage: () => "usage",
	formatDuration: (value: number) => `${value}ms`,
	formatToolCall: () => "tool",
	shortenPath: (value: string) => value,
}));

vi.mock("../utils.js", () => ({
	getFinalOutput: () => "",
	getDisplayItems: () => [],
	getOutputTail: () => ["line a", "line b"],
	getLastActivity: () => "recent activity",
}));

import { renderWidget } from "../render.js";
import { WIDGET_KEY } from "../types.js";

function createCtx() {
	const widgets = new Map<string, unknown>();
	return {
		hasUI: true,
		ui: {
			theme: {
				fg: (_color: string, text: string) => text,
			},
			setWidget(key: string, value: unknown) {
				widgets.set(key, value);
			},
		},
		_widgets: widgets,
	};
}

describe("subagent async widget rendering", () => {
	it("suppresses the widget when safe mode requests suppression", () => {
		const ctx = createCtx();
		renderWidget(
			ctx as any,
			[
				{
					asyncId: "abc123",
					asyncDir: "/tmp/run",
					status: "running",
					mode: "single",
					updatedAt: Date.now(),
					startedAt: Date.now() - 1000,
				},
			],
			{ suppressed: true },
		);

		expect(ctx._widgets.get(WIDGET_KEY)).toBeUndefined();
	});

	it("renders active jobs when not suppressed", () => {
		const ctx = createCtx();
		renderWidget(ctx as any, [
			{
				asyncId: "abc123",
				asyncDir: "/tmp/run",
				status: "running",
				mode: "single",
				agents: ["scout"],
				updatedAt: Date.now(),
				startedAt: Date.now() - 1000,
				outputFile: "/tmp/out.log",
				totalTokens: { input: 10, output: 5, total: 15 },
			},
		]);

		const lines = ctx._widgets.get(WIDGET_KEY) as string[];
		expect(lines[0]).toContain("Async subagents");
		expect(lines.join("\n")).toContain("recent activity");
	});
});
