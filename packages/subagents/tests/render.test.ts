

const renderMocks = vi.hoisted(() => ({
	getDisplayItems: vi.fn(() => []),
	getFinalOutput: vi.fn((messages: any[]) => messages.at(-1)?.content?.[0]?.text ?? ""),
	getLastActivity: vi.fn(() => "recent activity"),
	getOutputTail: vi.fn(() => ["line a", "line b"]),
}));

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({
	getMarkdownTheme: () => ({ theme: "markdown" }),
}));

vi.mock<typeof import('@mariozechner/pi-tui')>(import('@mariozechner/pi-tui'), () => ({
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
	visibleWidth: (text: string) => text.replaceAll("\u001B[0m", "").length,
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

vi.mock<typeof import('../formatters.js')>(import('../formatters.js'), () => ({
	formatDuration: (value: number) => `${value}ms`,
	formatTokens: (value: number) => `${value}t`,
	formatToolCall: (name: string) => `tool:${name}`,
	formatUsage: (_usage: unknown, model?: string) => `usage:${model ?? "none"}`,
	shortenPath: (value: string) => value.replace(process.env.HOME ?? "", "~"),
}));

vi.mock<typeof import('../utils.js')>(import('../utils.js'), () => ({
	getDisplayItems: renderMocks.getDisplayItems,
	getFinalOutput: renderMocks.getFinalOutput,
	getLastActivity: renderMocks.getLastActivity,
	getOutputTail: renderMocks.getOutputTail,
}));

import { renderSubagentResult, renderWidget } from "../render.js";
import { WIDGET_KEY } from "../types.js";

function createTheme() {
	return {
		accent: (text: string) => text,
		bold: (text: string) => `**${text}**`,
		dim: (text: string) => text,
		error: (text: string) => text,
		fg: (_color: string, text: string) => text,
		muted: (text: string) => text,
		success: (text: string) => text,
		toolTitle: (text: string) => text,
		warning: (text: string) => text,
	};
}

function createCtx() {
	const widgets = new Map<string, unknown>();
	const setWidget = vi.fn((key: string, value: unknown) => {
		widgets.set(key, value);
	});
	return {
		_setWidget: setWidget,
		_widgets: widgets,
		hasUI: true,
		ui: {
			setWidget,
			theme: createTheme(),
		},
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
					asyncDir: "/tmp/run",
					asyncId: "abc123",
					mode: "single",
					startedAt: Date.now() - 1000,
					status: "running",
					updatedAt: Date.now(),
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
			agents: ["scout", "planner"],
			asyncDir: "/tmp/done",
			asyncId: "done123",
			mode: "chain",
			startedAt: Date.now() - 2000,
			status: "complete",
			totalTokens: { input: 10, output: 5, total: 15 },
			updatedAt: Date.now(),
		};

		renderWidget(ctx as never, [
			{
				agents: ["scout"],
				asyncDir: "/tmp/run",
				asyncId: "abc123",
				mode: "single",
				outputFile: "/tmp/out.log",
				startedAt: Date.now() - 1000,
				status: "running",
				totalTokens: { input: 10, output: 5, total: 15 },
				updatedAt: Date.now(),
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
		expect(ctx._setWidget.mock.calls).toHaveLength(callsBefore + 1);
	});

	it("wraps running debug tail lines while keeping the status header truncated", () => {
		const originalColumns = process.stdout.columns;
		process.stdout.columns = 30;
		renderMocks.getOutputTail.mockReturnValue(["MODEL -> session-default: openai/gpt-5-mini with a long suffix"]);

		try {
			const ctx = createCtx();
			renderWidget(ctx as never, [
				{
					agents: ["very-long-agent-name"],
					asyncDir: "/tmp/run",
					asyncId: "abcdef123456",
					mode: "single",
					outputFile: "/tmp/out.log",
					startedAt: Date.now() - 1000,
					status: "running",
					totalTokens: { input: 10, output: 5, total: 15 },
					updatedAt: Date.now(),
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

describe(renderSubagentResult, () => {
	it("renders plain text when no detailed results are available", () => {
		const widget: any = renderSubagentResult(
			{ content: [{ text: "Fallback output", type: "text" }] } as never,
			{ expanded: false },
			createTheme() as never,
		);

		expect(widget.text).toContain("Fallback output");
	});

	it("renders single-result details including tools, markdown, skills, and artifacts", () => {
		renderMocks.getDisplayItems.mockReturnValue([{ args: { command: "ls" }, name: "bash", type: "tool" }]);
		const widget: any = renderSubagentResult(
			{
				content: [{ text: "ok", type: "text" }],
				details: {
					mode: "single",
					results: [
						{
							agent: "scout",
							artifactPaths: {
								inputPath: "/tmp/artifacts/input.md",
								jsonlPath: "/tmp/artifacts/run.jsonl",
								metadataPath: "/tmp/artifacts/meta.json",
								outputPath: "/tmp/artifacts/output.md",
							},
							exitCode: 0,
							messages: [{ role: "assistant", content: [{ type: "text", text: "Final answer" }] }],
							model: "anthropic/claude-sonnet-4",
							progressSummary: { durationMs: 99, tokens: 15, toolCount: 2 },
							sessionFile: "/tmp/session/run.jsonl",
							skills: ["git"],
							skillsWarning: "Missing: context7",
							task: "Inspect the repo carefully",
							truncation: { text: "Trimmed output", truncated: true },
							usage: { cacheRead: 1, cacheWrite: 0, cost: 0.2, input: 10, output: 5, turns: 1 },
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
		expect(widget.children.some((child: any) => child.text === "Trimmed output")).toBeTruthy();
		expect(widget.children.some((child: any) => child.constructor.name === "Markdown")).toBeTruthy();
	});

	it("renders chain results with chain visualization, pending steps, running details, and artifact dirs", () => {
		const widget: any = renderSubagentResult(
			{
				content: [{ text: "chain", type: "text" }],
				details: {
					artifacts: { dir: "/tmp/artifacts", files: [] },
					chainAgents: ["scout", "planner", "reviewer"],
					currentStepIndex: 1,
					mode: "chain",
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
					totalSteps: 3,
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
