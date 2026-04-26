import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	detectSubagentError,
	extractTextFromContent,
	extractToolArgsPreview,
	findByPrefix,
	findLatestSessionFile,
	getDisplayItems,
	getFinalOutput,
	getLastActivity,
	getOutputTail,
	mapConcurrent,
	readStatus,
	writePrompt,
} from "../utils.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

beforeEach(() => {
	vi.useRealTimers();
});

afterEach(() => {
	for (const dir of tempDirs) {
		fs.rmSync(dir, { force: true, recursive: true });
	}
	tempDirs.length = 0;
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("subagent utils", () => {
	it("reads cached async status files and refreshes when mtimes change", () => {
		const asyncDir = createTempDir("pi-subagent-status-");
		const statusPath = path.join(asyncDir, "status.json");
		fs.writeFileSync(statusPath, JSON.stringify({ runId: "run-1", state: "running" }));

		const first = readStatus(asyncDir);
		const second = readStatus(asyncDir);
		expect(first).toStrictEqual({ runId: "run-1", state: "running" });
		expect(second).toBe(first);

		fs.writeFileSync(statusPath, JSON.stringify({ runId: "run-1", state: "complete" }));
		const nextTime = new Date(Date.now() + 5000);
		fs.utimesSync(statusPath, nextTime, nextTime);
		const third = readStatus(asyncDir);
		expect(third).toStrictEqual({ runId: "run-1", state: "complete" });
		expect(readStatus(path.join(asyncDir, "missing"))).toBeNull();
	});

	it("reads output tails with caching and reports last activity", () => {
		const outputDir = createTempDir("pi-subagent-output-");
		const outputPath = path.join(outputDir, "output.log");
		fs.writeFileSync(outputPath, `${"x".repeat(150)}\nline two\nline three\nline four\n`);

		const tail = getOutputTail(outputPath, 2);
		expect(tail).toHaveLength(2);
		expect(tail[0]).toContain("line three");
		expect(tail[1]).toContain("line four");
		expect(getOutputTail(outputPath, 2)).toStrictEqual(tail);
		expect(getOutputTail()).toStrictEqual([]);
		expect(getLastActivity(outputPath)).toBe("active now");

		const oneMinuteAgo = new Date(Date.now() - 65_000);
		fs.utimesSync(outputPath, oneMinuteAgo, oneMinuteAgo);
		expect(getLastActivity(outputPath)).toBe("active 1m ago");
		expect(getLastActivity(path.join(outputDir, "missing.log"))).toBe("");
	});

	it("finds files by prefix, latest sessions, and writes prompts safely", () => {
		const dir = createTempDir("pi-subagent-files-");
		fs.writeFileSync(path.join(dir, "abc-first.json"), "one");
		fs.writeFileSync(path.join(dir, "abc-second.txt"), "two");
		fs.writeFileSync(path.join(dir, "other.txt"), "three");

		expect(findByPrefix(dir, "abc-")).toBe(path.join(dir, "abc-first.json"));
		expect(findByPrefix(dir, "abc-", ".txt")).toBe(path.join(dir, "abc-second.txt"));
		expect(findByPrefix(dir, "missing")).toBeNull();

		const sessionDir = createTempDir("pi-subagent-sessions-");
		const older = path.join(sessionDir, "old.jsonl");
		const newer = path.join(sessionDir, "new.jsonl");
		fs.writeFileSync(older, "old");
		fs.writeFileSync(newer, "new");
		const oldTime = new Date(Date.now() - 10_000);
		const newTime = new Date(Date.now() + 10_000);
		fs.utimesSync(older, oldTime, oldTime);
		fs.utimesSync(newer, newTime, newTime);
		expect(findLatestSessionFile(sessionDir)).toBe(newer);
		expect(findLatestSessionFile(path.join(sessionDir, "missing"))).toBeNull();

		const prompt = writePrompt("agent/name", "System prompt");
		tempDirs.push(prompt.dir);
		expect(prompt.path).toContain("agent_name.md");
		expect(fs.readFileSync(prompt.path, "utf8")).toBe("System prompt");
	});

	it("extracts outputs, tool previews, display items, and nested text content", () => {
		const messages = [
			{
				content: [
					{ type: "text", text: "First" },
					{ type: "toolCall", name: "bash", arguments: { command: "ls" } },
				],
				role: "assistant",
			},
			{ content: [{ type: "text", text: "Second" }], role: "assistant" },
		] as never;

		expect(getFinalOutput(messages)).toBe("Second");
		expect(getDisplayItems(messages)).toStrictEqual([
			{ text: "First", type: "text" },
			{ args: { command: "ls" }, name: "bash", type: "tool" },
			{ text: "Second", type: "text" },
		]);
		expect(extractToolArgsPreview({ args: '{"q":"pi"}', server: "docs", tool: "search" })).toBe(
			'docs/search {"q":"pi"}',
		);
		expect(extractToolArgsPreview({ command: "x".repeat(70) })).toBe(`${"x".repeat(57)}...`);
		expect(extractToolArgsPreview({ note: "brief detail" })).toBe("note=brief detail");
		expect(extractToolArgsPreview({})).toBe("");
		expect(
			extractTextFromContent([
				{ text: "Hello", type: "text" },
				{ content: [{ type: "text", text: "Nested" }], type: "tool_result" },
				{ text: "Loose text" },
			]),
		).toBe("Hello\nNested\nLoose text");
		expect(extractTextFromContent("plain text")).toBe("plain text");
		expect(extractTextFromContent(null)).toBe("");
	});

	it("detects recovered and unrecovered tool failures", () => {
		const recovered = detectSubagentError([
			{ content: [{ type: "text", text: "exit code 1" }], isError: true, role: "toolResult", toolName: "bash" },
			{ content: [{ type: "text", text: "Recovered response" }], role: "assistant" },
		] as never);
		expect(recovered).toStrictEqual({ hasError: false });

		const explicitError = detectSubagentError([
			{ content: [{ type: "text", text: "Started" }], role: "assistant" },
			{ content: [{ type: "text", text: "permission denied" }], isError: true, role: "toolResult", toolName: "read" },
		] as never);
		expect(explicitError).toMatchObject({ errorType: "read", exitCode: 1, hasError: true });

		const bashExit = detectSubagentError([
			{
				content: [{ type: "text", text: "Command failed with exit code 23" }],
				isError: false,
				role: "toolResult",
				toolName: "bash",
			},
		] as never);
		expect(bashExit).toStrictEqual({
			details: "Command failed with exit code 23",
			errorType: "bash",
			exitCode: 23,
			hasError: true,
		});

		const bashFatal = detectSubagentError([
			{
				content: [{ type: "text", text: "Connection refused while contacting host" }],
				isError: false,
				role: "toolResult",
				toolName: "bash",
			},
		] as never);
		expect(bashFatal).toMatchObject({ errorType: "bash", exitCode: 1, hasError: true });
	});

	it("maps work with concurrency limits and optional staggering", async () => {
		vi.useFakeTimers();
		const startOrder: number[] = [];
		const finishOrder: number[] = [];
		const promise = mapConcurrent(
			["a", "b", "c"],
			0,
			async (item, index) => {
				startOrder.push(index);
				await new Promise((resolve) => setTimeout(resolve, item === "a" ? 20 : 5));
				finishOrder.push(index);
				return item.toUpperCase();
			},
			10,
		);

		await vi.advanceTimersByTimeAsync(60);
		await expect(promise).resolves.toStrictEqual(["A", "B", "C"]);
		expect(startOrder[0]).toBe(0);
		expect(finishOrder).toContain(0);

		await expect(mapConcurrent([1, 2], 5, async (item) => item * 2, 0)).resolves.toStrictEqual([2, 4]);
	});
});
