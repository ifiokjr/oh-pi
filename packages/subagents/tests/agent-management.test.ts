import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const discoveryState = vi.hoisted(() => ({
	builtin: [] as any[],
	user: [] as any[],
	project: [] as any[],
	chains: [] as any[],
	userDir: "",
	projectDir: "",
}));

const serializeAgentMock = vi.hoisted(() => vi.fn((agent: { name: string }) => `agent:${agent.name}`));
const serializeChainMock = vi.hoisted(() => vi.fn((chain: { name: string }) => `chain:${chain.name}`));
const discoverSkillsMock = vi.hoisted(() => vi.fn(() => [{ name: "git" }, { name: "context7" }]));

vi.mock("../agents.js", () => ({
	discoverAgentsAll: vi.fn(() => ({ ...discoveryState })),
}));

vi.mock("../agent-serializer.js", () => ({
	serializeAgent: serializeAgentMock,
}));

vi.mock("../chain-serializer.js", () => ({
	serializeChain: serializeChainMock,
}));

vi.mock("../skills.js", () => ({
	discoverAvailableSkills: discoverSkillsMock,
}));

import { handleManagementAction } from "../agent-management.js";

function createCtx(cwd: string) {
	return {
		cwd,
		modelRegistry: {
			getAvailable: () => [{ provider: "anthropic", id: "claude-sonnet-4" }],
		},
	};
}

const tempDirs: string[] = [];

function createDirs() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "oh-pi-agent-management-"));
	tempDirs.push(root);
	const userDir = path.join(root, "user-agents");
	const projectDir = path.join(root, "project-agents");
	fs.mkdirSync(userDir, { recursive: true });
	fs.mkdirSync(projectDir, { recursive: true });
	discoveryState.userDir = userDir;
	discoveryState.projectDir = projectDir;
	return { root, userDir, projectDir };
}

beforeEach(() => {
	discoveryState.builtin = [];
	discoveryState.user = [];
	discoveryState.project = [];
	discoveryState.chains = [];
	serializeAgentMock.mockClear();
	serializeChainMock.mockClear();
	discoverSkillsMock.mockClear();
});

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

describe("handleManagementAction", () => {
	it("lists and gets agents and chains across scopes", () => {
		const { root, userDir, projectDir } = createDirs();
		const userAgentPath = path.join(userDir, "helper.md");
		const chainPath = path.join(projectDir, "delivery.chain.md");
		fs.writeFileSync(userAgentPath, "agent:helper", "utf8");
		fs.writeFileSync(chainPath, "chain:delivery", "utf8");
		discoveryState.builtin = [
			{
				name: "scout",
				description: "Builtin scout",
				source: "builtin",
				filePath: "/builtin/scout.md",
			},
		];
		discoveryState.user = [
			{
				name: "helper",
				description: "User helper",
				source: "user",
				filePath: userAgentPath,
				systemPrompt: "Be useful",
				skills: ["git"],
				tools: ["read"],
				extraFields: { category: "analysis" },
			},
		];
		discoveryState.project = [];
		discoveryState.chains = [
			{
				name: "delivery",
				description: "Ship work",
				source: "project",
				filePath: chainPath,
				steps: [
					{
						agent: "helper",
						task: "inspect",
						output: "report.md",
						reads: ["spec.md"],
						progress: true,
					},
				],
			},
		];

		const ctx = createCtx(root);
		const listResult = handleManagementAction("list", {}, ctx as never);
		expect(listResult.isError).toBeFalsy();
		expect(listResult.content[0]?.text).toContain("- scout (builtin): Builtin scout");
		expect(listResult.content[0]?.text).toContain("- helper (user): User helper");
		expect(listResult.content[0]?.text).toContain("- delivery (project): Ship work");

		const getResult = handleManagementAction(
			"get",
			{
				agent: "helper",
				chainName: "delivery",
			},
			ctx as never,
		);
		expect(getResult.content[0]?.text).toContain("Agent: helper (user)");
		expect(getResult.content[0]?.text).toContain("Skills: git");
		expect(getResult.content[0]?.text).toContain("Chain: delivery (project)");
		expect(getResult.content[0]?.text).toContain("Output: report.md");
	});

	it("creates agents and chains with warnings for unknown models, skills, and agents", () => {
		const { root, projectDir } = createDirs();
		const ctx = createCtx(root);

		const createAgent = handleManagementAction(
			"create",
			{
				config: {
					name: "My Helper",
					description: "Created from tests",
					scope: "project",
					systemPrompt: "Assist with repo work",
					tools: "read,write,mcp:github",
					skills: "git,missing-skill",
					model: "openai/gpt-5",
					extensions: "prompt.md,npm:@scope/pkg",
					reads: "spec.md,notes.md",
					progress: true,
				},
			},
			ctx as never,
		);

		const createdAgentPath = path.join(projectDir, "my-helper.md");
		expect(fs.existsSync(createdAgentPath)).toBe(true);
		expect(fs.readFileSync(createdAgentPath, "utf8")).toBe("agent:my-helper");
		expect(createAgent.content[0]?.text).toContain(`Created agent 'my-helper' at ${createdAgentPath}.`);
		expect(createAgent.content[0]?.text).toContain(
			"Warning: model 'openai/gpt-5' is not in the current model registry.",
		);
		expect(createAgent.content[0]?.text).toContain("Warning: skills not found: missing-skill.");

		const createChain = handleManagementAction(
			"create",
			{
				config: {
					name: "Delivery Chain",
					description: "Coordinate steps",
					scope: "project",
					steps: [
						{ agent: "my-helper", task: "inspect" },
						{
							agent: "missing-agent",
							task: "ship",
							model: "missing-model",
							skills: ["missing-skill"],
						},
					],
				},
			},
			ctx as never,
		);

		const createdChainPath = path.join(projectDir, "delivery-chain.chain.md");
		expect(fs.existsSync(createdChainPath)).toBe(true);
		expect(fs.readFileSync(createdChainPath, "utf8")).toBe("chain:delivery-chain");
		expect(createChain.content[0]?.text).toContain("Warning: chain steps reference unknown agents:");
		expect(createChain.content[0]?.text).toContain("missing-agent");
		expect(createChain.content[0]?.text).toContain("my-helper");
		expect(createChain.content[0]?.text).toContain(
			"Warning: step 2 (missing-agent): model 'missing-model' is not in the current model registry.",
		);
		expect(createChain.content[0]?.text).toContain("Warning: step 2 (missing-agent): skills not found: missing-skill.");
	});

	it("updates renamed agents and warns about chain references", () => {
		const { root, userDir } = createDirs();
		const ctx = createCtx(root);
		const oldPath = path.join(userDir, "helper.md");
		fs.writeFileSync(oldPath, "agent:helper", "utf8");
		discoveryState.user = [
			{
				name: "helper",
				description: "User helper",
				source: "user",
				filePath: oldPath,
				systemPrompt: "Be useful",
				extraFields: { createdBy: "management-api" },
			},
		];
		discoveryState.chains = [
			{
				name: "delivery",
				description: "Ship work",
				source: "project",
				filePath: path.join(root, "delivery.chain.md"),
				steps: [{ agent: "helper", task: "inspect" }],
			},
		];

		const updateResult = handleManagementAction(
			"update",
			{
				agent: "helper",
				config: {
					name: "Renamed Helper",
					description: "Renamed helper",
					skills: "git,missing-skill",
				},
			},
			ctx as never,
		);

		const renamedPath = path.join(userDir, "renamed-helper.md");
		expect(fs.existsSync(oldPath)).toBe(false);
		expect(fs.existsSync(renamedPath)).toBe(true);
		expect(fs.readFileSync(renamedPath, "utf8")).toBe("agent:renamed-helper");
		expect(updateResult.content[0]?.text).toContain(`Updated agent 'helper' to 'renamed-helper' at ${renamedPath}.`);
		expect(updateResult.content[0]?.text).toContain("Warning: skills not found: missing-skill.");
		expect(updateResult.content[0]?.text).toContain("Warning: chains still reference 'helper': delivery (project).");
	});

	it("rejects deleting builtin agents and deletes mutable chains", () => {
		const { root, projectDir } = createDirs();
		const ctx = createCtx(root);
		const chainPath = path.join(projectDir, "delivery.chain.md");
		fs.writeFileSync(chainPath, "chain:delivery", "utf8");
		discoveryState.builtin = [
			{
				name: "scout",
				description: "Builtin scout",
				source: "builtin",
				filePath: "/builtin/scout.md",
			},
		];
		discoveryState.chains = [
			{
				name: "delivery",
				description: "Ship work",
				source: "project",
				filePath: chainPath,
				steps: [{ agent: "scout", task: "inspect" }],
			},
		];

		const builtinDelete = handleManagementAction("delete", { agent: "scout" }, ctx as never);
		expect(builtinDelete.isError).toBe(true);
		expect(builtinDelete.content[0]?.text).toContain("Agent 'scout' is builtin and cannot be modified.");

		const deleteChain = handleManagementAction(
			"delete",
			{ chainName: "delivery", agentScope: "project" },
			ctx as never,
		);
		expect(deleteChain.isError).toBeFalsy();
		expect(deleteChain.content[0]?.text).toBe(`Deleted chain 'delivery' at ${chainPath}.`);
		expect(fs.existsSync(chainPath)).toBe(false);
	});
});
