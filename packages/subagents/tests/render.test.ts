import { beforeEach, describe, expect, it, vi } from "vitest";

const renderMocks = vi.hoisted(() => ({
	getFinalOutput: vi.fn((messages: any[]) => messages.at(-1)?.content?.[0]?.text ?? ""),
	getDisplayItems: vi.fn(() => []),
	getOutputTail: vi.fn(() => ["line a", "line b"]),
	getLastActivity: vi.fn(() => "recent activity"),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	getMarkdownTheme: () => ({ theme: "markdown" }),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Container: class {
		children: unknown[] = [];
		addChild(child: unknown) {
			this.children.push(child);
		}
	},
	Markdown: class {
		constructor(
			public text: string,
			public x: number,
			public y: number,
			public theme: unknown,
		) {}
	},
	Spacer: class {
		constructor(public size: number) {}
	},
	Text: class {
		constructor(
			public text: string,
			public x = 0,
			public y = 0,
		) {}
	},
	truncateToWidth: (text: string, width: number) => (text.length <= width ? text : `${text.slice(0, width - 1)}…`),
	visibleWidth: (text: string) => text.replaceAll("\u001b[0m", "").length,
	wrapTextWithAnsi: (text: string, width: number) => {
		if (text.length <= width) {
			return [text];
		}
		const lines: string[] = [];
		for (let start = 0; start < text.length; start += width) {
			lines.push(text.slice(start, start + width));
		}
		return lines;
	},
}));

vi.mock("../formatters.js", () => ({
	formatTokens: (value: number) => `${value}t`,
	formatUsage: (_usage: unknown, model?: string) => `usage:${model ?? "none"}`,
	formatDuration: (value: number) => `${value}ms`,
	formatToolCall: (name: string) => `tool:${name}`,
	shortenPath: (value: string) => value.replace(process.env.HOME ?? "", "~"),
}));

vi.mock("../utils.js", () => ({
	getFinalOutput: renderMocks.getFinalOutput,
	getDisplayItems: renderMocks.getDisplayItems,
	getOutputTail: renderMocks.getOutputTail,
	getLastActivity: renderMocks.getLastActivity,
}));

import { renderSubagentResult, renderWidget } from "../render.js";
import { WIDGET_KEY } from "../types.js";

function createTheme() {
	return {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => `**${text}**`,
		accent: (text: string) => text,
		toolTitle: (text: string) => text,
		success: (text: string) => text,
		error: (text: string) => text,
		warning: (text: string) => text,
		dim: (text: string) => text,
		muted: (text: string) => text,
	};
}

function createCtx() {
	const widgets = new Map<string, unknown>();
	const setWidget = vi.fn((key: string, value: unknown) => {
		widgets.set(key, value);
	});
	return {
		hasUI: true,
		ui: {
			theme: createTheme(),
			setWidget,
		},
		_widgets: widgets,
		_setWidget: setWidget,
	};
}

beforeEach(() => {
	renderMocks.getFinalOutput.mockImplementation((messages: any[]) => messages.at(-1)?.content?.[0]?.text ?? "");
	renderMocks.getDisplayItems.mockReturnValue([]);
	renderMocks.getOutputTail.mockReturnValue(["line a", "line b"]);
	renderMocks.getLastActivity.mockReturnValue("recent activity");
	renderWidget(createCtx() as never, [], { suppressed: true });
});

describe("subagent async widget rendering", () => {
	it("suppresses and clears widgets when requested", () => {
		const ctx = createCtx();
		renderWidget(
			ctx as never,
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
			{},
		);
		expect(ctx._widgets.get(WIDGET_KEY)).toBeDefined();

		renderWidget(ctx as never, [], { suppressed: true });
		expect(ctx._widgets.get(WIDGET_KEY)).toBeUndefined();
	});

	it("renders running jobs with tail output and avoids redundant completed rerenders", () => {
		const ctx = createCtx();
		const completedJob = {
			asyncId: "done123",
			asyncDir: "/tmp/done",
			status: "complete",
			mode: "chain",
			agents: ["scout", "planner"],
			updatedAt: Date.now(),
			startedAt: Date.now() - 2000,
			totalTokens: { input: 10, output: 5, total: 15 },
		};

		renderWidget(ctx as never, [
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
		expect(lines.join("\n")).toContain("line a");
		expect(lines.join("\n")).toContain("15t tok");

		const callsBefore = ctx._setWidget.mock.calls.length;
		renderWidget(ctx as never, [completedJob]);
		renderWidget(ctx as never, [completedJob]);
		expect(ctx._setWidget.mock.calls.length).toBe(callsBefore + 1);
	});

	it("wraps running debug tail lines while keeping the status header truncated", () => {
		const originalColumns = process.stdout.columns;
		process.stdout.columns = 30;
		renderMocks.getOutputTail.mockReturnValue(["MODEL -> session-default: openai/gpt-5-mini with a long suffix"]);

		try {
			const ctx = createCtx();
			renderWidget(ctx as never, [
				{
					asyncId: "abcdef123456",
					asyncDir: "/tmp/run",
					status: "running",
					mode: "single",
					agents: ["very-long-agent-name"],
					updatedAt: Date.now(),
					startedAt: Date.now() - 1000,
					outputFile: "/tmp/out.log",
					totalTokens: { input: 10, output: 5, total: 15 },
				},
			]);

			const lines = ctx._widgets.get(WIDGET_KEY) as string[];
			expect(lines[1]).toContain("…");
			expect(lines.slice(2)).toHaveLength(3);
			expect(lines[2]?.trimEnd()).toBe("  > MODEL -> session-default:");
			expect(lines.slice(2).join("")).toBe("  > MODEL -> session-default: openai/gpt-5-mini with a long suffix");
			expect(lines.slice(2).join("\n")).not.toContain("…");
		} finally {
			process.stdout.columns = originalColumns;
		}
	});
});

describe("renderSubagentResult", () => {
	it("renders plain text when no detailed results are available", () => {
		const widget: any = renderSubagentResult(
			{ content: [{ type: "text", text: "Fallback output" }] } as never,
			{ expanded: false },
			createTheme() as never,
		);

		expect(widget.text).toContain("Fallback output");
	});

	it("renders single-result details including tools, markdown, skills, and artifacts", () => {
		renderMocks.getDisplayItems.mockReturnValue([{ type: "tool", name: "bash", args: { command: "ls" } }]);
		const widget: any = renderSubagentResult(
			{
				content: [{ type: "text", text: "ok" }],
				details: {
					mode: "single",
					results: [
						{
							agent: "scout",
							task: "Inspect the repo carefully",
							exitCode: 0,
							messages: [{ role: "assistant", content: [{ type: "text", text: "Final answer" }] }],
							usage: { input: 10, output: 5, cacheRead: 1, cacheWrite: 0, cost: 0.2, turns: 1 },
							model: "anthropic/claude-sonnet-4",
							skills: ["git"],
							skillsWarning: "Missing: context7",
							sessionFile: "/tmp/session/run.jsonl",
							artifactPaths: {
								inputPath: "/tmp/artifacts/input.md",
								outputPath: "/tmp/artifacts/output.md",
								metadataPath: "/tmp/artifacts/meta.json",
								jsonlPath: "/tmp/artifacts/run.jsonl",
							},
							truncation: { text: "Trimmed output", truncated: true },
							progressSummary: { toolCount: 2, tokens: 15, durationMs: 99 },
						},
					],
				},
			} as never,
			{ expanded: true },
			createTheme() as never,
		);

		const childTexts = widget.children
			.map((child: any) => child.text)
			.filter(Boolean)
			.join("\n");
		expect(childTexts).toContain("**scout**");
		expect(childTexts).toContain("Task: Inspect the repo carefully");
		expect(childTexts).toContain("tool:bash");
		expect(childTexts).toContain("Skills: git");
		expect(childTexts).toContain("[!] Missing: context7");
		expect(childTexts).toContain("usage:anthropic/claude-sonnet-4");
		expect(childTexts).toContain("Session: /tmp/session/run.jsonl");
		expect(childTexts).toContain("Artifacts: /tmp/artifacts/output.md");
		expect(widget.children.some((child: any) => child.text === "Trimmed output")).toBe(true);
		expect(widget.children.some((child: any) => child.constructor.name === "Markdown")).toBe(true);
	});

	it("renders chain results with chain visualization, pending steps, running details, and artifact dirs", () => {
		const widget: any = renderSubagentResult(
			{
				content: [{ type: "text", text: "chain" }],
				details: {
					mode: "chain",
					chainAgents: ["scout", "planner", "reviewer"],
					totalSteps: 3,
					currentStepIndex: 1,
					results: [
						{
							agent: "scout",
							task: "Collect facts",
							exitCode: 0,
							messages: [{ role: "assistant", content: [{ type: "text", text: "" }] }],
							usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
							progress: {
								index: 0,
								agent: "scout",
								status: "completed",
								task: "Collect facts",
								recentTools: [],
								recentOutput: [],
								toolCount: 1,
								tokens: 5,
								durationMs: 20,
							},
						},
						{
							agent: "planner",
							task: "[Write to: /tmp/plan.md] Draft plan",
							exitCode: 0,
							messages: [{ role: "assistant", content: [{ type: "text", text: "Plan draft" }] }],
							usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
							model: "openai/gpt-5",
							skills: ["plan"],
							skillsWarning: "Missing: context7",
							progress: {
								index: 1,
								agent: "planner",
								status: "running",
								task: "Draft plan",
								skills: ["plan"],
								currentTool: "write",
								currentToolArgs: '{"path":"/tmp/plan.md"}',
								recentTools: [{ tool: "read", args: "spec.md", endMs: Date.now() }],
								recentOutput: ["Drafting", "Polishing"],
								toolCount: 2,
								tokens: 10,
								durationMs: 40,
							},
						},
					],
					progress: [
						{
							index: 0,
							agent: "scout",
							status: "completed",
							task: "Collect facts",
							recentTools: [],
							recentOutput: [],
							toolCount: 1,
							tokens: 5,
							durationMs: 20,
						},
						{
							index: 1,
							agent: "planner",
							status: "running",
							task: "Draft plan",
							recentTools: [],
							recentOutput: [],
							toolCount: 2,
							tokens: 10,
							durationMs: 40,
						},
					],
					artifacts: { dir: "/tmp/artifacts", files: [] },
				},
			} as never,
			{ expanded: true },
			createTheme() as never,
		);

		const childTexts = widget.children
			.map((child: any) => child.text)
			.filter(Boolean)
			.join("\n");
		expect(childTexts).toContain("**chain** 2/3");
		expect(childTexts).toContain("scout →");
		expect(childTexts).toContain("planner →");
		expect(childTexts).toContain("reviewer");
		expect(childTexts).toContain("Step 1: **scout**");
		expect(childTexts).toContain("status: ○ pending");
		expect(childTexts).toContain("output: /tmp/plan.md");
		expect(childTexts).toContain("skills: plan");
		expect(childTexts).toContain("[!] Missing: context7");
		expect(childTexts).toContain('> write: {"path":"/tmp/plan.md"}');
		expect(childTexts).toContain("read: spec.md");
		expect(childTexts).toContain("Artifacts dir: /tmp/artifacts");
	});
});
