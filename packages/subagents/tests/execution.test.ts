const executionMocks = vi.hoisted(() => {
	class MiniEmitter {
		private listeners = new Map<string, ((...args: any[]) => void)[]>();

		on(event: string, handler: (...args: any[]) => void) {
			const handlers = this.listeners.get(event) ?? [];
			handlers.push(handler);
			this.listeners.set(event, handlers);
			return this;
		}

		emit(event: string, ...args: any[]) {
			for (const handler of this.listeners.get(event) ?? []) {
				handler(...args);
			}
			return true;
		}
	}

	const procs: any[] = [];
	const spawn = vi.fn(() => {
		const events = new MiniEmitter();
		const proc = {
			emit(event: string, ...args: any[]) {
				return events.emit(event, ...args);
			},
			kill: vi.fn(),
			killed: false,
			on: vi.fn(function (this: any, event: string, handler: (...args: any[]) => void) {
				events.on(event, handler);
				return this;
			}),
			stderr: new MiniEmitter(),
			stdout: new MiniEmitter(),
		};
		procs.push(proc);
		return proc;
	});

	return {
		buildSkillInjection: vi.fn(
			(skills: Array<{ name: string }>) => `INJECT:${skills.map((skill) => skill.name).join(",")}`,
		),
		createJsonlWriter: vi.fn(() => ({ writeLine: vi.fn(), close: vi.fn(async () => {}) })),
		detectSubagentError: vi.fn(() => ({ hasError: false })),
		ensureArtifactsDir: vi.fn(),
		extractTextFromContent: vi.fn((content: any[]) =>
			content
				.filter((item) => item.type === "text")
				.map((item) => item.text)
				.join("\n"),
		),
		extractToolArgsPreview: vi.fn((args: Record<string, unknown>) => JSON.stringify(args)),
		findLatestSessionFile: vi.fn(() => "/tmp/session/run.jsonl"),
		getArtifactPaths: vi.fn(() => ({
			inputPath: "/tmp/artifacts/input.md",
			outputPath: "/tmp/artifacts/output.md",
			metadataPath: "/tmp/artifacts/metadata.json",
			jsonlPath: "/tmp/artifacts/run.jsonl",
		})),
		getFinalOutput: vi.fn((messages: any[]) => messages.map((message) => message.content?.[0]?.text ?? "").join("\n")),
		getPiSpawnCommand: vi.fn((args: string[]) => ({ command: "pi", args })),
		getSubagentDepthEnv: vi.fn(() => ({ PI_SUBAGENT_DEPTH: "1" })),
		mkdirSync: vi.fn(),
		mkdtempSync: vi.fn(() => "/tmp/pi-subagent-task-dir"),
		procs,
		resolveSkills: vi.fn((skills: string[]) => ({
			resolved: skills.filter((skill) => skill !== "missing").map((name) => ({ name })),
			missing: skills.filter((skill) => skill === "missing"),
		})),
		rmSync: vi.fn(),
		spawn,
		truncateOutput: vi.fn(() => ({ truncated: true, output: "trimmed" })),
		writeArtifact: vi.fn(),
		writeFileSync: vi.fn(),
		writeMetadata: vi.fn(),
		writePrompt: vi.fn(() => ({ dir: "/tmp/pi-prompt", path: "/tmp/pi-prompt/system.md" })),
	};
});

vi.mock<typeof import("node:child_process")>(import("node:child_process"), () => ({ spawn: executionMocks.spawn }));
vi.mock<typeof import("node:fs")>(import("node:fs"), () => ({
	mkdirSync: executionMocks.mkdirSync,
	mkdtempSync: executionMocks.mkdtempSync,
	rmSync: executionMocks.rmSync,
	writeFileSync: executionMocks.writeFileSync,
}));
vi.mock<typeof import("../artifacts.js")>(import("../artifacts.js"), () => ({
	ensureArtifactsDir: executionMocks.ensureArtifactsDir,
	getArtifactPaths: executionMocks.getArtifactPaths,
	writeArtifact: executionMocks.writeArtifact,
	writeMetadata: executionMocks.writeMetadata,
}));
vi.mock<typeof import("../types.js")>(import("../types.js"), () => ({
	DEFAULT_IDLE_TIMEOUT_MS: 15 * 60 * 1000,
	DEFAULT_MAX_OUTPUT: { bytes: 200 * 1024, lines: 5000 },
	getSubagentDepthEnv: executionMocks.getSubagentDepthEnv,
	truncateOutput: executionMocks.truncateOutput,
}));
vi.mock<typeof import("../utils.js")>(import("../utils.js"), () => ({
	detectSubagentError: executionMocks.detectSubagentError,
	extractTextFromContent: executionMocks.extractTextFromContent,
	extractToolArgsPreview: executionMocks.extractToolArgsPreview,
	findLatestSessionFile: executionMocks.findLatestSessionFile,
	getFinalOutput: executionMocks.getFinalOutput,
	writePrompt: executionMocks.writePrompt,
}));
vi.mock<typeof import("../skills.js")>(import("../skills.js"), () => ({
	buildSkillInjection: executionMocks.buildSkillInjection,
	resolveSkills: executionMocks.resolveSkills,
}));
vi.mock<typeof import("../pi-spawn.js")>(import("../pi-spawn.js"), () => ({
	getPiSpawnCommand: executionMocks.getPiSpawnCommand,
}));
vi.mock<typeof import("../jsonl-writer.js")>(import("../jsonl-writer.js"), () => ({
	createJsonlWriter: executionMocks.createJsonlWriter,
}));

import { applyThinkingSuffix, runSync } from "../execution.js";

function emitStdoutLines(proc: any, lines: string[]) {
	proc.stdout.emit("data", Buffer.from(`${lines.join("\n")}\n`));
}

beforeEach(() => {
	for (const mock of Object.values(executionMocks)) {
		if (typeof mock === "function" && "mockReset" in mock) {
			(mock as ReturnType<typeof vi.fn>).mockReset();
		}
	}

	executionMocks.procs.length = 0;
	executionMocks.spawn.mockImplementation(() => {
		const proc = {
			emit(event: string, ...args: any[]) {
				for (const handler of this.listeners.get(event) ?? []) {
					handler(...args);
				}
				return true;
			},
			kill: vi.fn(),
			killed: false,
			listeners: new Map<string, Array<(...args: any[]) => void>>(),
			on(event: string, handler: (...args: any[]) => void) {
				const handlers = this.listeners.get(event) ?? [];
				handlers.push(handler);
				this.listeners.set(event, handlers);
				return this;
			},
			stderr: {
				emit(event: string, ...args: any[]) {
					for (const handler of this.listeners.get(event) ?? []) {
						handler(...args);
					}
					return true;
				},
				listeners: new Map<string, Array<(...args: any[]) => void>>(),
				on(event: string, handler: (...args: any[]) => void) {
					const handlers = this.listeners.get(event) ?? [];
					handlers.push(handler);
					this.listeners.set(event, handlers);
					return this;
				},
			},
			stdout: {
				emit(event: string, ...args: any[]) {
					for (const handler of this.listeners.get(event) ?? []) {
						handler(...args);
					}
					return true;
				},
				listeners: new Map<string, Array<(...args: any[]) => void>>(),
				on(event: string, handler: (...args: any[]) => void) {
					const handlers = this.listeners.get(event) ?? [];
					handlers.push(handler);
					this.listeners.set(event, handlers);
					return this;
				},
			},
		};
		executionMocks.procs.push(proc);
		return proc;
	});
	executionMocks.resolveSkills.mockImplementation((skills: string[]) => ({
		missing: skills.filter((skill) => skill === "missing"),
		resolved: skills.filter((skill) => skill !== "missing").map((name) => ({ name })),
	}));
	executionMocks.detectSubagentError.mockReturnValue({ hasError: false });
	executionMocks.findLatestSessionFile.mockReturnValue("/tmp/session/run.jsonl");
	executionMocks.createJsonlWriter.mockReturnValue({ close: vi.fn(async () => {}), writeLine: vi.fn() });
	executionMocks.truncateOutput.mockReturnValue({ output: "trimmed", truncated: true });
});

describe(applyThinkingSuffix, () => {
	it("adds thinking levels when needed and preserves existing suffixes", () => {
		expect(applyThinkingSuffix("anthropic/claude-sonnet-4", "high")).toBe("anthropic/claude-sonnet-4:high");
		expect(applyThinkingSuffix("anthropic/claude-sonnet-4:low", "high")).toBe("anthropic/claude-sonnet-4:low");
		expect(applyThinkingSuffix("anthropic/claude-sonnet-4", "off")).toBe("anthropic/claude-sonnet-4");
	});
});

describe(runSync, () => {
	it("returns an explicit error for unknown agents", async () => {
		await expect(runSync("/repo", [], "missing", "Inspect", { share: false })).resolves.toMatchObject({
			agent: "missing",
			error: "Unknown agent: missing",
			exitCode: 1,
		});
	});

	it("resolves skills against task cwd, not runtime cwd", async () => {
		const runPromise = runSync(
			"/runtime-dir",
			[{ model: "anthropic/claude-sonnet-4", name: "reviewer", skills: ["ecsc-reviewer"] }],
			"reviewer",
			"Inspect",
			{ cwd: "/legal/project", share: false },
		);

		const proc = executionMocks.procs[0];
		proc.emit("close", 0);
		await runPromise;

		expect(executionMocks.resolveSkills).toHaveBeenCalledWith(["ecsc-reviewer"], "/legal/project");
	});

	it("streams successful runs, writes artifacts, and records truncation + shared sessions", async () => {
		const onUpdate = vi.fn();
		const longTask = "A".repeat(9000);
		const runPromise = runSync(
			"/repo",
			[
				{
					extensions: ["./extensions/extra.ts"],
					mcpDirectTools: ["read"],
					model: "anthropic/claude-sonnet-4",
					name: "scout",
					skills: ["git", "missing"],
					systemPrompt: "Base prompt",
					thinking: "high",
					tools: ["bash", "./tools/custom.ts"],
				},
			],
			"scout",
			longTask,
			{
				artifactConfig: { enabled: true },
				artifactsDir: "/tmp/artifacts",
				cwd: "/workspace",
				index: 2,
				maxOutput: { bytes: 100, lines: 10 },
				modelCategory: "explicit",
				modelOverride: "openai/gpt-5",
				modelSource: "runtime-override",
				onUpdate,
				runId: "run-1",
				sessionDir: "/tmp/session",
				share: true,
			},
		);

		const proc = executionMocks.procs[0];
		emitStdoutLines(proc, [
			JSON.stringify({ args: { cmd: "ls" }, toolName: "bash", type: "tool_execution_start" }),
			JSON.stringify({ type: "tool_execution_end" }),
			JSON.stringify({
				message: {
					content: [{ type: "text", text: "Hello\nWorld" }],
					model: "openai/gpt-5:high",
					role: "assistant",
					usage: { cacheRead: 1, cacheWrite: 2, cost: { total: 1.25 }, input: 10, output: 5 },
				},
				type: "message_end",
			}),
			JSON.stringify({
				message: { content: [{ type: "text", text: "Tool result" }], role: "assistant" },
				type: "tool_result_end",
			}),
		]);
		proc.emit("close", 0);

		const result = await runPromise;

		expect(executionMocks.resolveSkills).toHaveBeenCalledWith(["git", "missing"], "/workspace");
		expect(executionMocks.spawn).toHaveBeenCalledWith(
			"pi",
			expect.arrayContaining([
				"--mode",
				"json",
				"-p",
				"--session-dir",
				"/tmp/session",
				"--models",
				"openai/gpt-5:high",
				"--tools",
				"bash",
				"--no-skills",
				"--no-extensions",
				"--extension",
				"./extensions/extra.ts",
				"--append-system-prompt",
				"/tmp/pi-prompt/system.md",
				"@/tmp/pi-prompt/task.md",
			]),
			expect.objectContaining({ cwd: "/workspace", stdio: ["ignore", "pipe", "pipe"] }),
		);
		expect(executionMocks.writeFileSync).toHaveBeenCalledWith(
			"/tmp/pi-prompt/task.md",
			expect.stringContaining(longTask),
			expect.objectContaining({ mode: 0o600 }),
		);
		expect(result).toMatchObject({
			agent: "scout",
			artifactPaths: {
				inputPath: "/tmp/artifacts/input.md",
				jsonlPath: "/tmp/artifacts/run.jsonl",
				metadataPath: "/tmp/artifacts/metadata.json",
				outputPath: "/tmp/artifacts/output.md",
			},
			exitCode: 0,
			model: "openai/gpt-5:high",
			modelCategory: "explicit",
			modelSource: "runtime-override",
			progressSummary: { durationMs: expect.any(Number), tokens: 15, toolCount: 1 },
			sessionFile: "/tmp/session/run.jsonl",
			skills: ["git"],
			skillsWarning: "Skills not found: missing",
			truncation: { output: "trimmed", truncated: true },
		});
		expect(result.usage).toMatchObject({ cacheRead: 1, cacheWrite: 2, cost: 1.25, input: 10, output: 5, turns: 1 });
		expect(result.progress).toMatchObject({
			currentTool: undefined,
			recentOutput: ["Hello", "World", "Tool result"],
			status: "completed",
			tokens: 15,
			toolCount: 1,
		});
		expect(onUpdate).toHaveBeenCalledWith();
		expect(executionMocks.ensureArtifactsDir).toHaveBeenCalledWith("/tmp/artifacts");
		expect(executionMocks.writeArtifact).toHaveBeenCalledWith(
			"/tmp/artifacts/input.md",
			expect.stringContaining("Task for scout"),
		);
		expect(executionMocks.writeArtifact).toHaveBeenCalledWith("/tmp/artifacts/output.md", "Hello\nWorld\nTool result");
		expect(executionMocks.writeMetadata).toHaveBeenCalledWith(
			"/tmp/artifacts/metadata.json",
			expect.objectContaining({ agent: "scout", exitCode: 0, runId: "run-1", skills: ["git"] }),
		);
		expect(executionMocks.rmSync).toHaveBeenCalledWith("/tmp/pi-prompt", { force: true, recursive: true });
	});

	it("captures parse errors, surfaces detected internal failures, and handles abort signals", async () => {
		vi.useFakeTimers();
		executionMocks.detectSubagentError.mockReturnValue({
			details: "Tool crashed",
			errorType: "tool_result",
			exitCode: 9,
			hasError: true,
		});
		const controller = new AbortController();
		const runPromise = runSync(
			"/repo",
			[{ model: "anthropic/claude-sonnet-4", name: "reviewer" }],
			"reviewer",
			"Inspect",
			{ share: false, signal: controller.signal },
		);

		const proc = executionMocks.procs[0];
		emitStdoutLines(proc, ["not-json"]);
		controller.abort();
		await vi.advanceTimersByTimeAsync(3000);
		proc.emit("close", 0);

		const result = await runPromise;
		expect(executionMocks.resolveSkills).toHaveBeenCalledWith([], "/repo");
		expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
		expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
		expect(result).toMatchObject({
			aborted: true,
			error: "tool_result failed (exit 9): Tool crashed",
			exitCode: 9,
			parseErrors: 1,
		});
		expect(result.progress).toMatchObject({ error: "tool_result failed (exit 9): Tool crashed", status: "failed" });
		vi.useRealTimers();
	});
});
