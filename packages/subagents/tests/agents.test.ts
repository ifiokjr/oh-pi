import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverAgents, discoverAgentsAll } from "../agents.js";
import { getSharedProjectAgentsDir } from "../project-agents-storage.js";

const tempDirs: string[] = [];
let savedHome: string | undefined;
let savedUserProfile: string | undefined;
let savedProjectAgentsMode: string | undefined;

function unsetEnv(key: keyof NodeJS.ProcessEnv): void {
	Reflect.deleteProperty(process.env, key);
}

function createTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function writeAgentFile(rootDir: string, relativePath: string, content: string): void {
	const filePath = path.join(rootDir, relativePath);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, "utf-8");
}

beforeEach(() => {
	savedHome = process.env.HOME;
	savedUserProfile = process.env.USERPROFILE;
	savedProjectAgentsMode = process.env.PI_SUBAGENT_PROJECT_AGENTS_MODE;
});

afterEach(() => {
	if (savedHome === undefined) {
		unsetEnv("HOME");
	} else {
		process.env.HOME = savedHome;
	}

	if (savedUserProfile === undefined) {
		unsetEnv("USERPROFILE");
	} else {
		process.env.USERPROFILE = savedUserProfile;
	}

	if (savedProjectAgentsMode === undefined) {
		unsetEnv("PI_SUBAGENT_PROJECT_AGENTS_MODE");
	} else {
		process.env.PI_SUBAGENT_PROJECT_AGENTS_MODE = savedProjectAgentsMode;
	}

	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("discoverAgents", () => {
	it("loads bundled builtin agents from the package", () => {
		const cwd = createTempDir("subagents-builtin-");
		const result = discoverAgents(cwd, "both");
		const names = result.agents.map((agent) => agent.name);
		expect(names).toContain("scout");
		expect(names).toContain("planner");
		expect(names).toContain("worker");
		expect(names).toContain("reviewer");
		expect(names).toContain("artist");
		expect(names).toContain("frontend-designer");
		expect(names).toContain("multimodal-summariser");

		const byName = new Map(result.agents.map((agent) => [agent.name, agent]));
		expect(byName.get("artist")?.extraFields?.category).toBe("visual-engineering");
		expect(byName.get("frontend-designer")?.extraFields?.category).toBe("visual-engineering");
		expect(byName.get("multimodal-summariser")?.extraFields?.category).toBe("multimodal-default");
		expect(result.projectAgentsDir).toBe(getSharedProjectAgentsDir(cwd));
	});

	it("prefers shared project agents over user and builtin agents by default", () => {
		const homeDir = createTempDir("subagents-home-");
		const projectDir = createTempDir("subagents-project-");
		process.env.HOME = homeDir;
		process.env.USERPROFILE = homeDir;
		process.env.PI_SUBAGENT_PROJECT_AGENTS_MODE = "shared";

		writeAgentFile(
			homeDir,
			".pi/agent/agents/scout.md",
			"---\nname: scout\ndescription: User scout\n---\n\nUser prompt\n",
		);
		writeAgentFile(
			getSharedProjectAgentsDir(projectDir),
			"scout.md",
			"---\nname: scout\ndescription: Project scout\n---\n\nProject prompt\n",
		);

		const result = discoverAgents(projectDir, "both");
		const scout = result.agents.find((agent) => agent.name === "scout");
		expect(scout?.source).toBe("project");
		expect(scout?.description).toBe("Project scout");
		expect(result.projectAgentsDir).toBe(getSharedProjectAgentsDir(projectDir));
	});

	it("finds shared project agents from mirrored parent workspaces", () => {
		const homeDir = createTempDir("subagents-parent-home-");
		const projectDir = createTempDir("subagents-parent-project-");
		const nestedDir = path.join(projectDir, "packages", "feature");
		process.env.HOME = homeDir;
		process.env.USERPROFILE = homeDir;
		process.env.PI_SUBAGENT_PROJECT_AGENTS_MODE = "shared";
		fs.mkdirSync(nestedDir, { recursive: true });

		writeAgentFile(
			getSharedProjectAgentsDir(projectDir),
			"scout.md",
			"---\nname: scout\ndescription: Parent project scout\n---\n\nProject prompt\n",
		);

		const result = discoverAgents(nestedDir, "both");
		const scout = result.agents.find((agent) => agent.name === "scout");
		expect(scout?.source).toBe("project");
		expect(scout?.description).toBe("Parent project scout");
		expect(result.projectAgentsDir).toBe(getSharedProjectAgentsDir(projectDir));
	});

	it("migrates legacy .pi/agents into the shared store when shared mode is enabled", () => {
		const homeDir = createTempDir("subagents-migrate-home-");
		const projectDir = createTempDir("subagents-migrate-project-");
		process.env.HOME = homeDir;
		process.env.USERPROFILE = homeDir;
		process.env.PI_SUBAGENT_PROJECT_AGENTS_MODE = "shared";

		writeAgentFile(
			projectDir,
			".pi/agents/scout.md",
			"---\nname: scout\ndescription: Legacy project scout\n---\n\nProject prompt\n",
		);

		const result = discoverAgents(projectDir, "both");
		const scout = result.agents.find((agent) => agent.name === "scout");
		expect(scout?.source).toBe("project");
		expect(scout?.description).toBe("Legacy project scout");
		expect(fs.existsSync(path.join(projectDir, ".pi", "agents"))).toBe(false);
		expect(fs.existsSync(path.join(getSharedProjectAgentsDir(projectDir), "scout.md"))).toBe(true);
	});
});

describe("discoverAgentsAll", () => {
	it("returns builtin, user, project agents, and chain files from the shared project store", () => {
		const homeDir = createTempDir("subagents-all-home-");
		const projectDir = createTempDir("subagents-all-project-");
		process.env.HOME = homeDir;
		process.env.USERPROFILE = homeDir;
		process.env.PI_SUBAGENT_PROJECT_AGENTS_MODE = "shared";

		writeAgentFile(
			homeDir,
			".pi/agent/agents/custom-user.md",
			"---\nname: custom-user\ndescription: User agent\n---\n\nUser prompt\n",
		);
		writeAgentFile(
			getSharedProjectAgentsDir(projectDir),
			"custom-project.md",
			"---\nname: custom-project\ndescription: Project agent\n---\n\nProject prompt\n",
		);
		writeAgentFile(
			getSharedProjectAgentsDir(projectDir),
			"review-pipeline.chain.md",
			"---\nname: review-pipeline\ndescription: Review chain\n---\n\n## scout\n\nScan {task}\n",
		);

		const result = discoverAgentsAll(projectDir);
		expect(result.builtin.length).toBeGreaterThan(0);
		expect(result.user.map((agent) => agent.name)).toContain("custom-user");
		expect(result.project.map((agent) => agent.name)).toContain("custom-project");
		expect(result.chains.map((chain) => chain.name)).toContain("review-pipeline");
		expect(result.userDir).toBe(path.join(homeDir, ".pi", "agent", "agents"));
		expect(result.projectDir).toBe(getSharedProjectAgentsDir(projectDir));
	});

	it("supports opting back into repo-local project agent storage", () => {
		const homeDir = createTempDir("subagents-local-home-");
		const projectDir = createTempDir("subagents-local-project-");
		process.env.HOME = homeDir;
		process.env.USERPROFILE = homeDir;
		process.env.PI_SUBAGENT_PROJECT_AGENTS_MODE = "project";

		writeAgentFile(
			projectDir,
			".pi/agents/custom-project.md",
			"---\nname: custom-project\ndescription: Project agent\n---\n\nProject prompt\n",
		);

		const result = discoverAgentsAll(projectDir);
		expect(result.project.map((agent) => agent.name)).toContain("custom-project");
		expect(result.projectDir).toBe(path.join(projectDir, ".pi", "agents"));
	});
});
