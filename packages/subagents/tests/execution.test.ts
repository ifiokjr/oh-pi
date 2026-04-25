import { beforeEach, describe, expect, it, vi } from "vitest";

const executionMocks = vi.hoisted(() => {
	class MiniEmitter {
		private listeners = new Map<string, Array<(...args: any[]) => void>>();

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
			stdout: new MiniEmitter(),
			stderr: new MiniEmitter(),
			on: vi.fn(function (this: any, event: string, handler: (...args: any[]) => void) {
				events.on(event, handler);
				return this;
			}),
			emit(event: string, ...args: any[]) {
				return events.emit(event, ...args);
			},
			kill: vi.fn(),
			killed: false,
		};
		procs.push(proc);
		return proc;
	});

	return {
		procs,
		spawn,
		mkdirSync: vi.fn(),
		mkdtempSync: vi.fn(() => "/tmp/pi-subagent-task-dir"),
		writeFileSync: vi.fn(),
		rmSync: vi.fn(),
		writePrompt: vi.fn(() => ({ dir: "/tmp/pi-prompt", path: "/tmp/pi-prompt/system.md" })),
		getFinalOutput: vi.fn((messages: any[]) => messages.map((message) => message.content?.[0]?.text ?? "").join("\n")),
		findLatestSessionFile: vi.fn(() => "/tmp/session/run.jsonl"),
		detectSubagentError: vi.fn(() => ({ hasError: false })),
		extractToolArgsPreview: vi.fn((args: Record<string, unknown>) => JSON.stringify(args)),
		extractTextFromContent: vi.fn((content: any[]) =>
			content
				.filter((item) => item.type === "text")
				.map((item) => item.text)
				.join("\n"),
		),
		buildSkillInjection: vi.fn(
			(skills: Array<{ name: string }>) => `INJECT:${skills.map((skill) => skill.name).join(",")}`,
		),
		resolveSkills: vi.fn((skills: string[]) => ({
			resolved: skills.filter((skill) => skill !== "missing").map((name) => ({ name })),
			missing: skills.filter((skill) => skill === "missing"),
		})),
		getPiSpawnCommand: vi.fn((args: string[]) => ({ command: "pi", args })),
		createJsonlWriter: vi.fn(() => ({ writeLine: vi.fn(), close: vi.fn(async () => {}) })),
		ensureArtifactsDir: vi.fn(),
		getArtifactPaths: vi.fn(() => ({
			inputPath: "/tmp/artifacts/input.md",
			outputPath: "/tmp/artifacts/output.md",
			metadataPath: "/tmp/artifacts/metadata.json",
			jsonlPath: "/tmp/artifacts/run.jsonl",
		})),
		writeArtifact: vi.fn(),
		writeMetadata: vi.fn(),
		truncateOutput: vi.fn(() => ({ truncated: true, output: "trimmed" })),
		getSubagentDepthEnv: vi.fn(() => ({ PI_SUBAGENT_DEPTH: "1" })),
	};
});

vi.mock("node:child_process", () => ({ spawn: executionMocks.spawn }));
vi.mock("node:fs", () => ({
	mkdirSync: executionMocks.mkdirSync,
	mkdtempSync: executionMocks.mkdtempSync,
	writeFileSync: executionMocks.writeFileSync,
	rmSync: executionMocks.rmSync,
}));
vi.mock("../artifacts.js", () => ({
	ensureArtifactsDir: executionMocks.ensureArtifactsDir,
	getArtifactPaths: executionMocks.getArtifactPaths,
	writeArtifact: executionMocks.writeArtifact,
	writeMetadata: executionMocks.writeMetadata,
}));
vi.mock("../types.js", () => ({
	DEFAULT_MAX_OUTPUT: { bytes: 200 * 1024, lines: 5000 },
	DEFAULT_IDLE_TIMEOUT_MS: 15 * 60 * 1000,
	truncateOutput: executionMocks.truncateOutput,
	getSubagentDepthEnv: executionMocks.getSubagentDepthEnv,
}));
vi.mock("../utils.js", () => ({
	writePrompt: executionMocks.writePrompt,
	getFinalOutput: executionMocks.getFinalOutput,
	findLatestSessionFile: executionMocks.findLatestSessionFile,
	detectSubagentError: executionMocks.detectSubagentError,
	extractToolArgsPreview: executionMocks.extractToolArgsPreview,
	extractTextFromContent: executionMocks.extractTextFromContent,
}));
vi.mock("../skills.js", () => ({
	buildSkillInjection: executionMocks.buildSkillInjection,
	resolveSkills: executionMocks.resolveSkills,
}));
vi.mock("../pi-spawn.js", () => ({
	getPiSpawnCommand: executionMocks.getPiSpawnCommand,
}));
vi.mock("../jsonl-writer.js", () => ({
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
			stdout: {
				listeners: new Map<string, Array<(...args: any[]) => void>>(),
				on(event: string, handler: (...args: any[]) => void) {
					const handlers = this.listeners.get(event) ?? [];
					handlers.push(handler);
					this.listeners.set(event, handlers);
					return this;
				},
				emit(event: string, ...args: any[]) {
					for (const handler of this.listeners.get(event) ?? []) {
						handler(...args);
					}
					return true;
				},
			},
			stderr: {
				listeners: new Map<string, Array<(...args: any[]) => void>>(),
				on(event: string, handler: (...args: any[]) => void) {
					const handlers = this.listeners.get(event) ?? [];
					handlers.push(handler);
					this.listeners.set(event, handlers);
					return this;
				},
				emit(event: string, ...args: any[]) {
					for (const handler of this.listeners.get(event) ?? []) {
						handler(...args);
					}
					return true;
				},
			},
			listeners: new Map<string, Array<(...args: any[]) => void>>(),
			on(event: string, handler: (...args: any[]) => void) {
				const handlers = this.listeners.get(event) ?? [];
				handlers.push(handler);
				this.listeners.set(event, handlers);
				return this;
			},
			emit(event: string, ...args: any[]) {
				for (const handler of this.listeners.get(event) ?? []) {
					handler(...args);
				}
				return true;
			},
			kill: vi.fn(),
			killed: false,
		};
		executionMocks.procs.push(proc);
		return proc;
	});
	executionMocks.resolveSkills.mockImplementation((skills: string[]) => ({
		resolved: skills.filter((skill) => skill !== "missing").map((name) => ({ name })),
		missing: skills.filter((skill) => skill === "missing"),
	}));
	executionMocks.detectSubagentError.mockReturnValue({ hasError: false });
	executionMocks.findLatestSessionFile.mockReturnValue("/tmp/session/run.jsonl");
	executionMocks.createJsonlWriter.mockReturnValue({ writeLine: vi.fn(), close: vi.fn(async () => {}) });
	executionMocks.truncateOutput.mockReturnValue({ truncated: true, output: "trimmed" });
});

describe("applyThinkingSuffix", () => {
	it("adds thinking levels when needed and preserves existing suffixes", () => {
		expect(applyThinkingSuffix("anthropic/claude-sonnet-4", "high")).toBe("anthropic/claude-sonnet-4:high");
		expect(applyThinkingSuffix("anthropic/claude-sonnet-4:low", "high")).toBe("anthropic/claude-sonnet-4:low");
		expect(applyThinkingSuffix("anthropic/claude-sonnet-4", "off")).toBe("anthropic/claude-sonnet-4");
	});
});

describe("runSync", () => {
	it("returns an explicit error for unknown agents", async () => {
		await expect(runSync("/repo", [], "missing", "Inspect", { share: false })).resolves.toMatchObject({
			agent: "missing",
			exitCode: 1,
			error: "Unknown agent: missing",
		});
	});

	it("resolves skills against task cwd, not runtime cwd", async () => {
		const runPromise = runSync(
			"/runtime-dir",
			[{ name: "reviewer", model: "anthropic/claude-sonnet-4", skills: ["ecsc-reviewer"] }],
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
					name: "scout",
					model: "anthropic/claude-sonnet-4",
					thinking: "high",
					tools: ["bash", "./tools/custom.ts"],
					extensions: ["./extensions/extra.ts"],
					systemPrompt: "Base prompt",
					skills: ["git", "missing"],
					mcpDirectTools: ["read"],
				},
			],
			"scout",
			longTask,
			{
				cwd: "/workspace",
				onUpdate,
				share: true,
				sessionDir: "/tmp/session",
				runId: "run-1",
				index: 2,
				artifactsDir: "/tmp/artifacts",
				artifactConfig: { enabled: true },
				maxOutput: { bytes: 100, lines: 10 },
				modelOverride: "openai/gpt-5",
				modelSource: "runtime-override",
				modelCategory: "explicit",
			},
		);

		const proc = executionMocks.procs[0];
		emitStdoutLines(proc, [
			JSON.stringify({ type: "tool_execution_start", toolName: "bash", args: { cmd: "ls" } }),
			JSON.stringify({ type: "tool_execution_end" }),
			JSON.stringify({
				type: "message_end",
				message: {
					role: "assistant",
					model: "openai/gpt-5:high",
					content: [{ type: "text", text: "Hello\nWorld" }],
					usage: { input: 10, output: 5, cacheRead: 1, cacheWrite: 2, cost: { total: 1.25 } },
				},
			}),
			JSON.stringify({
				type: "tool_result_end",
				message: { role: "assistant", content: [{ type: "text", text: "Tool result" }] },
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
			exitCode: 0,
			model: "openai/gpt-5:high",
			modelSource: "runtime-override",
			modelCategory: "explicit",
			skills: ["git"],
			skillsWarning: "Skills not found: missing",
			sessionFile: "/tmp/session/run.jsonl",
			artifactPaths: {
				inputPath: "/tmp/artifacts/input.md",
				outputPath: "/tmp/artifacts/output.md",
				metadataPath: "/tmp/artifacts/metadata.json",
				jsonlPath: "/tmp/artifacts/run.jsonl",
			},
			truncation: { truncated: true, output: "trimmed" },
			progressSummary: { toolCount: 1, tokens: 15, durationMs: expect.any(Number) },
		});
		expect(result.usage).toMatchObject({ input: 10, output: 5, cacheRead: 1, cacheWrite: 2, cost: 1.25, turns: 1 });
		expect(result.progress).toMatchObject({
			status: "completed",
			currentTool: undefined,
			recentOutput: ["Hello", "World", "Tool result"],
			toolCount: 1,
			tokens: 15,
		});
		expect(onUpdate).toHaveBeenCalled();
		expect(executionMocks.ensureArtifactsDir).toHaveBeenCalledWith("/tmp/artifacts");
		expect(executionMocks.writeArtifact).toHaveBeenCalledWith(
			"/tmp/artifacts/input.md",
			expect.stringContaining("Task for scout"),
		);
		expect(executionMocks.writeArtifact).toHaveBeenCalledWith("/tmp/artifacts/output.md", "Hello\nWorld\nTool result");
		expect(executionMocks.writeMetadata).toHaveBeenCalledWith(
			"/tmp/artifacts/metadata.json",
			expect.objectContaining({ runId: "run-1", agent: "scout", exitCode: 0, skills: ["git"] }),
		);
		expect(executionMocks.rmSync).toHaveBeenCalledWith("/tmp/pi-prompt", { recursive: true, force: true });
	});

	it("captures parse errors, surfaces detected internal failures, and handles abort signals", async () => {
		vi.useFakeTimers();
		executionMocks.detectSubagentError.mockReturnValue({
			hasError: true,
			exitCode: 9,
			errorType: "tool_result",
			details: "Tool crashed",
		});
		const controller = new AbortController();
		const runPromise = runSync(
			"/repo",
			[{ name: "reviewer", model: "anthropic/claude-sonnet-4" }],
			"reviewer",
			"Inspect",
			{ signal: controller.signal, share: false },
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
			exitCode: 9,
			aborted: true,
			parseErrors: 1,
			error: "tool_result failed (exit 9): Tool crashed",
		});
		expect(result.progress).toMatchObject({ status: "failed", error: "tool_result failed (exit 9): Tool crashed" });
		vi.useRealTimers();
	});
});
