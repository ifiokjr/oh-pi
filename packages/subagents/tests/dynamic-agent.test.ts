import { afterEach, describe, expect, it, vi } from "vitest";

const runSync = vi.hoisted(() => vi.fn());
const findAvailableModel = vi.hoisted(() => vi.fn());
const createManagedWorktree = vi.hoisted(() => vi.fn());
const createOwnerMetadata = vi.hoisted(() => vi.fn());
const removeManagedWorktree = vi.hoisted(() => vi.fn());

vi.mock("../execution.js", () => ({ runSync }));
vi.mock("../model-routing.js", () => ({ findAvailableModel }));
vi.mock("@ifi/oh-pi-core", () => ({
	createManagedWorktree,
	createOwnerMetadata,
	removeManagedWorktree,
}));

import { createDynamicAgent, resolveDynamicModel, runDynamicAgent } from "../dynamic-agent.js";

const sampleModels = [
	{
		provider: "anthropic",
		id: "claude-sonnet-4",
		name: "Claude Sonnet 4",
		reasoning: true,
		input: ["text"],
		contextWindow: 200_000,
		maxTokens: 8_000,
		cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 },
		fullId: "anthropic/claude-sonnet-4",
	},
	{
		provider: "openai",
		id: "gpt-5-mini",
		name: "GPT-5 Mini",
		reasoning: true,
		input: ["text"],
		contextWindow: 400_000,
		maxTokens: 128_000,
		cost: { input: 0.25, output: 2, cacheRead: 0, cacheWrite: 0 },
		fullId: "openai/gpt-5-mini",
	},
];

describe("createDynamicAgent", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("creates an agent with an auto-generated name", () => {
		const agent = createDynamicAgent({
			systemPrompt: "You are a test agent.",
		});

		expect(agent.name).toMatch(/^dynamic-\d+$/);
		expect(agent.systemPrompt).toBe("You are a test agent.");
		expect(agent.source).toBe("builtin");
		expect(agent.filePath).toBe("<dynamic>");
	});

	it("creates an agent with an explicit name", () => {
		const agent = createDynamicAgent({
			name: "my-agent",
			systemPrompt: "You are a test agent.",
		});

		expect(agent.name).toBe("my-agent");
		expect(agent.description).toBe("Ephemeral agent my-agent");
	});

	it("creates an agent with all optional fields populated", () => {
		const agent = createDynamicAgent({
			name: "full-agent",
			description: "Custom desc",
			systemPrompt: "Prompt",
			tools: ["read", "bash"],
			mcpDirectTools: ["mcp.tool"],
			skills: ["git"],
			extensions: ["ext"],
			model: "anthropic/claude-sonnet-4",
			thinking: "medium",
			idleTimeoutMs: 30_000,
		});

		expect(agent).toEqual({
			name: "full-agent",
			description: "Custom desc",
			systemPrompt: "Prompt",
			tools: ["read", "bash"],
			mcpDirectTools: ["mcp.tool"],
			skills: ["git"],
			extensions: ["ext"],
			model: "anthropic/claude-sonnet-4",
			thinking: "medium",
			idleTimeoutMs: 30_000,
			source: "builtin",
			filePath: "<dynamic>",
		});
	});

	it("increments the counter across multiple calls", () => {
		const a1 = createDynamicAgent({ systemPrompt: "A" });
		const a2 = createDynamicAgent({ systemPrompt: "B" });
		const a3 = createDynamicAgent({ systemPrompt: "C" });

		expect(a1.name).toMatch(/^dynamic-\d+$/);
		expect(a2.name).toMatch(/^dynamic-\d+$/);
		expect(a3.name).toMatch(/^dynamic-\d+$/);

		const n1 = Number.parseInt(a1.name.replace("dynamic-", ""), 10);
		const n2 = Number.parseInt(a2.name.replace("dynamic-", ""), 10);
		const n3 = Number.parseInt(a3.name.replace("dynamic-", ""), 10);

		expect(n2).toBe(n1 + 1);
		expect(n3).toBe(n2 + 1);
	});
});

describe("resolveDynamicModel", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("uses the explicit model when it is available", () => {
		findAvailableModel.mockReturnValue("anthropic/claude-sonnet-4");

		const result = resolveDynamicModel(
			{ model: "anthropic/claude-sonnet-4", systemPrompt: "test" },
			{ availableModels: sampleModels, currentModel: "openai/gpt-5-mini" },
		);

		expect(result).toBe("anthropic/claude-sonnet-4");
		expect(findAvailableModel).toHaveBeenCalledWith("anthropic/claude-sonnet-4", sampleModels);
	});

	it("falls back to currentModel with inherit policy when model is unavailable", () => {
		findAvailableModel.mockImplementation((name) => (name === "openai/gpt-5-mini" ? "openai/gpt-5-mini" : undefined));

		const result = resolveDynamicModel(
			{ model: "unknown-model", systemPrompt: "test" },
			{ availableModels: sampleModels, currentModel: "openai/gpt-5-mini" },
		);

		expect(result).toBe("openai/gpt-5-mini");
	});

	it("throws with scoped-only policy when model is unavailable", () => {
		findAvailableModel.mockReturnValue(undefined);

		expect(() =>
			resolveDynamicModel(
				{ model: "unknown-model", systemPrompt: "test", modelPolicy: "scoped-only" },
				{ availableModels: sampleModels, currentModel: "openai/gpt-5-mini" },
			),
		).toThrow('Dynamic agent "unnamed" requested model "unknown-model" is not in the scoped model list');
	});

	it("falls back to currentModel when explicit model is unavailable and no availableModels list", () => {
		findAvailableModel.mockReturnValue(undefined);

		const result = resolveDynamicModel(
			{ model: "unknown-model", systemPrompt: "test" },
			{ currentModel: "openai/gpt-5-mini" },
		);

		// availableModels is undefined, so spec.model is not validated;
		// falls through to currentModel since policy is inherit
		expect(result).toBe("openai/gpt-5-mini");
		expect(findAvailableModel).not.toHaveBeenCalled();
	});

	it("falls back to currentModel when no model is specified", () => {
		findAvailableModel.mockImplementation((name) => (name === "openai/gpt-5-mini" ? "openai/gpt-5-mini" : undefined));

		const result = resolveDynamicModel(
			{ systemPrompt: "test" },
			{ availableModels: sampleModels, currentModel: "openai/gpt-5-mini" },
		);

		expect(result).toBe("openai/gpt-5-mini");
	});

	it("returns undefined when no model and no currentModel are provided", () => {
		findAvailableModel.mockReturnValue(undefined);

		const result = resolveDynamicModel({ systemPrompt: "test" }, { availableModels: sampleModels });

		expect(result).toBeUndefined();
	});

	it("preserves thinking suffix through resolution", () => {
		findAvailableModel.mockReturnValue("anthropic/claude-sonnet-4:medium");

		const result = resolveDynamicModel(
			{ model: "anthropic/claude-sonnet-4:medium", systemPrompt: "test" },
			{ availableModels: sampleModels, currentModel: "openai/gpt-5-mini" },
		);

		expect(result).toBe("anthropic/claude-sonnet-4:medium");
	});

	it("validates currentModel against availableModels when falling back", () => {
		findAvailableModel.mockImplementation((name) => (name === "openai/gpt-5-mini" ? "openai/gpt-5-mini" : undefined));

		const result = resolveDynamicModel(
			{ systemPrompt: "test" },
			{ availableModels: sampleModels, currentModel: "openai/gpt-5-mini" },
		);

		expect(result).toBe("openai/gpt-5-mini");
		expect(findAvailableModel).toHaveBeenLastCalledWith("openai/gpt-5-mini", sampleModels);
	});

	it("returns undefined when currentModel is not in availableModels and list is provided", () => {
		findAvailableModel.mockReturnValue(undefined);

		const result = resolveDynamicModel(
			{ systemPrompt: "test" },
			{ availableModels: sampleModels, currentModel: "unknown/current" },
		);

		expect(result).toBeUndefined();
	});

	it("returns currentModel as-is when no availableModels list is provided", () => {
		findAvailableModel.mockReturnValue(undefined);

		const result = resolveDynamicModel({ systemPrompt: "test" }, { currentModel: "openai/gpt-5-mini" });

		expect(result).toBe("openai/gpt-5-mini");
	});

	it("defaults to inherit policy when modelPolicy is omitted", () => {
		findAvailableModel.mockImplementation((name) => (name === "openai/gpt-5-mini" ? "openai/gpt-5-mini" : undefined));

		const result = resolveDynamicModel(
			{ model: "bad-model", systemPrompt: "test" },
			{ availableModels: sampleModels, currentModel: "openai/gpt-5-mini" },
		);

		expect(result).toBe("openai/gpt-5-mini");
	});

	it("falls back with adaptive policy same as inherit", () => {
		findAvailableModel.mockImplementation((name) => (name === "openai/gpt-5-mini" ? "openai/gpt-5-mini" : undefined));

		const result = resolveDynamicModel(
			{ model: "bad-model", systemPrompt: "test", modelPolicy: "adaptive" },
			{ availableModels: sampleModels, currentModel: "openai/gpt-5-mini" },
		);

		expect(result).toBe("openai/gpt-5-mini");
	});
});

describe("runDynamicAgent", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("runs a dynamic agent with resolved model", async () => {
		findAvailableModel.mockReturnValue("anthropic/claude-sonnet-4");
		runSync.mockResolvedValue({
			usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: 0 },
			exitCode: 0,
		});

		const result = await runDynamicAgent(
			"/workspace",
			{ systemPrompt: "You are a bug finder.", model: "anthropic/claude-sonnet-4" },
			"Find bugs in src/utils.ts",
			{
				availableModels: sampleModels,
				currentModel: "openai/gpt-5-mini",
				runId: "run-123",
			},
		);

		expect(runSync).toHaveBeenCalledOnce();
		expect(runSync).toHaveBeenCalledWith(
			"/workspace",
			expect.arrayContaining([
				expect.objectContaining({
					name: expect.stringMatching(/^dynamic-\d+$/),
					systemPrompt: "You are a bug finder.",
					model: "anthropic/claude-sonnet-4",
					source: "builtin",
					filePath: "<dynamic>",
				}),
			]),
			expect.stringMatching(/^dynamic-\d+$/),
			"Find bugs in src/utils.ts",
			{ availableModels: sampleModels, currentModel: "openai/gpt-5-mini", runId: "run-123" },
		);
		expect(result.usage).toEqual({
			input: 100,
			output: 50,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0,
		});
	});

	it("falls back to currentModel when explicit model is unavailable", async () => {
		findAvailableModel.mockImplementation((name) => (name === "openai/gpt-5-mini" ? "openai/gpt-5-mini" : undefined));
		runSync.mockResolvedValue({
			usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: 0 },
			exitCode: 0,
		});

		await runDynamicAgent("/workspace", { systemPrompt: "test", model: "unknown-model" }, "task", {
			availableModels: sampleModels,
			currentModel: "openai/gpt-5-mini",
			runId: "run-456",
		});

		expect(runSync).toHaveBeenCalledOnce();
		const passedAgent = runSync.mock.calls[0][1][0];
		expect(passedAgent.model).toBe("openai/gpt-5-mini");
	});

	it("calls onUsage callback with usage data", async () => {
		findAvailableModel.mockReturnValue("anthropic/claude-sonnet-4");
		const usageData = {
			input: 200,
			output: 100,
			cacheRead: 10,
			cacheWrite: 5,
			cost: 0.5,
		};
		runSync.mockResolvedValue({ usage: usageData, exitCode: 0 });

		const onUsage = vi.fn();

		await runDynamicAgent("/workspace", { systemPrompt: "test" }, "task", { onUsage, runId: "run-789" });

		expect(onUsage).toHaveBeenCalledOnce();
		expect(onUsage).toHaveBeenCalledWith(usageData);
	});

	it("calls onUsage when not provided", async () => {
		findAvailableModel.mockReturnValue("anthropic/claude-sonnet-4");
		runSync.mockResolvedValue({
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
			exitCode: 0,
		});

		await runDynamicAgent("/workspace", { systemPrompt: "test" }, "task", { runId: "run-abc" });

		// onUsage not provided — no error thrown
		expect(runSync).toHaveBeenCalledOnce();
	});

	it("creates a worktree without runId (defaults runId)", async () => {
		findAvailableModel.mockReturnValue("anthropic/claude-sonnet-4");
		createOwnerMetadata.mockReturnValue({
			instanceId: "owner-no-run",
			hostname: "test",
			pid: 1234,
			createdFromCwd: "/workspace",
			sessionFile: null,
			sessionId: null,
			sessionName: null,
		});
		createManagedWorktree.mockReturnValue({
			worktreePath: "/wt/no-run",
			branch: "no-run",
			createdBranch: true,
			metadata: {
				id: "wt-nr",
				repoRoot: "/repo",
				worktreePath: "/wt/no-run",
				branch: "no-run",
				purpose: "test",
				createdAt: "2024",
				lastSeenAt: null,
				owner: {
					instanceId: "",
					hostname: "",
					pid: 0,
					createdFromCwd: "",
					sessionFile: null,
					sessionId: null,
					sessionName: null,
				},
				createdFromBranch: null,
				createdFromRef: "HEAD",
			},
		});
		runSync.mockResolvedValue({
			usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0 },
			exitCode: 0,
		});

		// Omit runId so options.runId ?? undefined is hit
		const result = await runDynamicAgent("/workspace", { systemPrompt: "test" }, "task", {
			worktree: { branch: "no-run", purpose: "no runId test" },
		});

		expect(createOwnerMetadata).toHaveBeenCalledOnce();
		expect(result.worktreePath).toBe("/wt/no-run");
		expect(runSync).toHaveBeenCalledOnce();
	});

	it("creates a worktree and runs the agent inside it", async () => {
		findAvailableModel.mockReturnValue("anthropic/claude-sonnet-4");
		createOwnerMetadata.mockReturnValue({
			instanceId: "owner-123",
			hostname: "test",
			pid: 1234,
			createdFromCwd: "/workspace",
			sessionFile: null,
			sessionId: null,
			sessionName: null,
		});
		createManagedWorktree.mockReturnValue({
			worktreePath: "/wt/test-branch-abc",
			branch: "test-branch",
			createdBranch: true,
			metadata: {},
		});
		runSync.mockResolvedValue({
			usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: 0 },
			exitCode: 0,
		});
		removeManagedWorktree.mockReturnValue({
			metadata: {},
			removed: true,
			removedFromGit: true,
			removedRegistryEntry: true,
			note: "ok",
		});

		const result = await runDynamicAgent("/workspace", { systemPrompt: "test" }, "task", {
			runId: "run-wt",
			worktree: { branch: "test-branch", purpose: "test purpose", baseRef: "main" },
		});

		expect(createOwnerMetadata).toHaveBeenCalledOnce();
		expect(createManagedWorktree).toHaveBeenCalledWith({
			cwd: "/workspace",
			branch: "test-branch",
			purpose: "test purpose",
			baseRef: "main",
			owner: {
				instanceId: "owner-123",
				hostname: "test",
				pid: 1234,
				createdFromCwd: "/workspace",
				sessionFile: null,
				sessionId: null,
				sessionName: null,
			},
		});
		expect(runSync).toHaveBeenCalledWith(
			"/wt/test-branch-abc",
			expect.any(Array),
			expect.any(String),
			"task",
			expect.objectContaining({ runId: "run-wt" }),
		);
		expect(result.worktreePath).toBe("/wt/test-branch-abc");
		expect(result.worktreeBranch).toBe("test-branch");
		// cleanup defaults to false
		expect(removeManagedWorktree).not.toHaveBeenCalled();
	});

	it("cleans up the worktree when cleanup: true", async () => {
		findAvailableModel.mockReturnValue("anthropic/claude-sonnet-4");
		createOwnerMetadata.mockReturnValue({
			instanceId: "owner-456",
			hostname: "test",
			pid: 1234,
			createdFromCwd: "/workspace",
			sessionFile: null,
			sessionId: null,
			sessionName: null,
		});
		createManagedWorktree.mockReturnValue({
			worktreePath: "/wt/cleanup-branch",
			branch: "cleanup-branch",
			createdBranch: true,
			metadata: {
				id: "wt-456",
				repoRoot: "/repo",
				worktreePath: "/wt/cleanup-branch",
				branch: "cleanup-branch",
				purpose: "test",
				createdAt: "2024",
				lastSeenAt: null,
				owner: {
					instanceId: "",
					hostname: "",
					pid: 0,
					createdFromCwd: "",
					sessionFile: null,
					sessionId: null,
					sessionName: null,
				},
				createdFromBranch: null,
				createdFromRef: "HEAD",
			},
		});
		runSync.mockResolvedValue({
			usage: { input: 5, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0 },
			exitCode: 0,
		});
		removeManagedWorktree.mockReturnValue({
			metadata: {},
			removed: true,
			removedFromGit: true,
			removedRegistryEntry: true,
			note: "ok",
		});

		await runDynamicAgent("/workspace", { systemPrompt: "test" }, "task", {
			runId: "run-cleanup",
			worktree: { branch: "cleanup-branch", purpose: "cleanup test", cleanup: true },
		});

		expect(removeManagedWorktree).toHaveBeenCalledOnce();
		expect(removeManagedWorktree).toHaveBeenCalledWith(expect.objectContaining({ id: "wt-456" }));
	});

	it("cleans up the worktree even when runSync throws", async () => {
		findAvailableModel.mockReturnValue("anthropic/claude-sonnet-4");
		createOwnerMetadata.mockReturnValue({
			instanceId: "owner-789",
			hostname: "test",
			pid: 1234,
			createdFromCwd: "/workspace",
			sessionFile: null,
			sessionId: null,
			sessionName: null,
		});
		createManagedWorktree.mockReturnValue({
			worktreePath: "/wt/error-branch",
			branch: "error-branch",
			createdBranch: true,
			metadata: {},
		});
		runSync.mockRejectedValue(new Error("runSync failed"));
		removeManagedWorktree.mockReturnValue({
			metadata: {},
			removed: true,
			removedFromGit: true,
			removedRegistryEntry: true,
			note: "ok",
		});

		await expect(
			runDynamicAgent("/workspace", { systemPrompt: "test" }, "task", {
				runId: "run-error",
				worktree: { branch: "error-branch", purpose: "error test", cleanup: true },
			}),
		).rejects.toThrow("runSync failed");

		expect(removeManagedWorktree).toHaveBeenCalledOnce();
	});

	it("ignores cleanup errors silently", async () => {
		findAvailableModel.mockReturnValue("anthropic/claude-sonnet-4");
		createOwnerMetadata.mockReturnValue({
			instanceId: "owner-000",
			hostname: "test",
			pid: 1234,
			createdFromCwd: "/workspace",
			sessionFile: null,
			sessionId: null,
			sessionName: null,
		});
		createManagedWorktree.mockReturnValue({
			worktreePath: "/wt/bad-branch",
			branch: "bad-branch",
			createdBranch: true,
			metadata: {},
		});
		runSync.mockResolvedValue({
			usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0 },
			exitCode: 0,
		});
		removeManagedWorktree.mockImplementation(() => {
			throw new Error("cleanup failed");
		});

		const result = await runDynamicAgent("/workspace", { systemPrompt: "test" }, "task", {
			runId: "run-bad-cleanup",
			worktree: { branch: "bad-branch", purpose: "bad cleanup", cleanup: true },
		});

		expect(result.exitCode).toBe(0);
		expect(removeManagedWorktree).toHaveBeenCalledOnce();
	});
});
