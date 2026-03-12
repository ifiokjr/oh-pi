import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverAgents, discoverAgentsAll } from "../agents.js";

const tempDirs: string[] = [];
let savedHome: string | undefined;
let savedUserProfile: string | undefined;

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
		expect(result.projectAgentsDir).toBeNull();
	});

	it("prefers project agents over user and builtin agents", () => {
		const homeDir = createTempDir("subagents-home-");
		const projectDir = createTempDir("subagents-project-");
		process.env.HOME = homeDir;
		process.env.USERPROFILE = homeDir;

		writeAgentFile(
			homeDir,
			".pi/agent/agents/scout.md",
			"---\nname: scout\ndescription: User scout\n---\n\nUser prompt\n",
		);
		writeAgentFile(
			projectDir,
			".pi/agents/scout.md",
			"---\nname: scout\ndescription: Project scout\n---\n\nProject prompt\n",
		);

		const result = discoverAgents(projectDir, "both");
		const scout = result.agents.find((agent) => agent.name === "scout");
		expect(scout?.source).toBe("project");
		expect(scout?.description).toBe("Project scout");
		expect(result.projectAgentsDir).toBe(path.join(projectDir, ".pi", "agents"));
	});
});

describe("discoverAgentsAll", () => {
	it("returns builtin, user, project agents, and chain files", () => {
		const homeDir = createTempDir("subagents-all-home-");
		const projectDir = createTempDir("subagents-all-project-");
		process.env.HOME = homeDir;
		process.env.USERPROFILE = homeDir;

		writeAgentFile(
			homeDir,
			".pi/agent/agents/custom-user.md",
			"---\nname: custom-user\ndescription: User agent\n---\n\nUser prompt\n",
		);
		writeAgentFile(
			projectDir,
			".pi/agents/custom-project.md",
			"---\nname: custom-project\ndescription: Project agent\n---\n\nProject prompt\n",
		);
		writeAgentFile(
			projectDir,
			".pi/agents/review-pipeline.chain.md",
			"---\nname: review-pipeline\ndescription: Review chain\n---\n\n## scout\n\nScan {task}\n",
		);

		const result = discoverAgentsAll(projectDir);
		expect(result.builtin.length).toBeGreaterThan(0);
		expect(result.user.map((agent) => agent.name)).toContain("custom-user");
		expect(result.project.map((agent) => agent.name)).toContain("custom-project");
		expect(result.chains.map((chain) => chain.name)).toContain("review-pipeline");
		expect(result.userDir).toBe(path.join(homeDir, ".pi", "agent", "agents"));
		expect(result.projectDir).toBe(path.join(projectDir, ".pi", "agents"));
	});
});
