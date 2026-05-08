import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const skillsMocks = vi.hoisted(() => ({
	execSync: vi.fn(() => "/tmp/global-node-modules\n"),
	expandHomeDir: vi.fn((value: string) => value.replace(/^~\//, "/tmp/home/")),
	loadSkills: vi.fn(() => ({ skills: [] })),
	packageResolve: vi.fn(async () => ({ skills: [] })),
	settingsCreate: vi.fn(() => ({ settings: {} })),
	resolveAgentDir: vi.fn(() => "/tmp/pi-agent"),
}));

vi.mock("node:child_process", () => ({
	execSync: skillsMocks.execSync,
}));

vi.mock("@ifi/oh-pi-core", () => ({
	expandHomeDir: skillsMocks.expandHomeDir,
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	DefaultPackageManager: class {
		resolve = skillsMocks.packageResolve;
	},
	SettingsManager: {
		create: skillsMocks.settingsCreate,
	},
	loadSkills: skillsMocks.loadSkills,
}));

vi.mock("../paths.js", () => ({
	resolveAgentDir: skillsMocks.resolveAgentDir,
}));

import {
	buildSkillInjection,
	clearSkillCache,
	discoverAvailableSkills,
	normalizeSkillInput,
	resolveSkillPath,
	resolveSkills,
	resolveSkillsAsync,
} from "../skills.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

beforeEach(() => {
	clearSkillCache();
	for (const mock of Object.values(skillsMocks)) {
		if (typeof mock === "function" && "mockReset" in mock) {
			(mock as ReturnType<typeof vi.fn>).mockReset();
		}
	}
	skillsMocks.execSync.mockReturnValue("/tmp/global-node-modules\n");
	skillsMocks.expandHomeDir.mockImplementation((value: string) => value.replace(/^~\//, "/tmp/home/"));
	skillsMocks.resolveAgentDir.mockReturnValue("/tmp/pi-agent");
});

afterEach(() => {
	clearSkillCache();
	for (const dir of tempDirs) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	tempDirs.length = 0;
});

describe("subagent skills", () => {
	it("normalizes skill input formats and builds injections", () => {
		expect(normalizeSkillInput(false)).toBe(false);
		expect(normalizeSkillInput(true)).toBeUndefined();
		expect(normalizeSkillInput([" git ", "git", "context7"])).toEqual(["git", "context7"]);
		expect(normalizeSkillInput('["git","context7"]')).toEqual(["git", "context7"]);
		expect(normalizeSkillInput("git, context7, git")).toEqual(["git", "context7"]);
		expect(
			buildSkillInjection([
				{
					name: "git",
					path: "/skills/git.md",
					source: "project",
					content: "Use git carefully.",
				},
				{
					name: "context7",
					path: "/skills/context7.md",
					source: "user",
					content: "Query docs first.",
				},
			]),
		).toBe('<skill name="git">\nUse git carefully.\n</skill>\n\n<skill name="context7">\nQuery docs first.\n</skill>');
	});

	it("discovers skills from default, package, settings, and global locations with source priority", () => {
		const cwd = createTempDir("pi-subagent-skills-project-");
		const agentDir = "/tmp/pi-agent";
		const globalRoot = "/tmp/global-node-modules";
		const homeRoot = "/tmp/home";
		for (const dir of [agentDir, globalRoot, homeRoot]) {
			fs.mkdirSync(dir, { recursive: true });
			tempDirs.push(dir);
		}

		const projectDefaultSkills = path.join(cwd, ".pi", "skills");
		const userDefaultSkills = path.join(agentDir, "skills");
		const projectPkgRoot = path.join(cwd, ".pi", "npm", "node_modules", "@scope", "pkg-a");
		const userPkgRoot = path.join(agentDir, "npm", "node_modules", "pkg-b");
		const globalPkgRoot = path.join(globalRoot, "pkg-c");
		const projectSettingsSkillDir = path.join(cwd, ".pi", "custom", "project-skill");
		const userSettingsSkillDir = path.join(homeRoot, "custom-user-skill");
		for (const dir of [
			projectDefaultSkills,
			userDefaultSkills,
			projectPkgRoot,
			userPkgRoot,
			globalPkgRoot,
			projectSettingsSkillDir,
			userSettingsSkillDir,
		]) {
			fs.mkdirSync(dir, { recursive: true });
		}

		fs.writeFileSync(
			path.join(projectPkgRoot, "package.json"),
			JSON.stringify({
				name: "@scope/pkg-a",
				pi: { skills: ["./package-skills"] },
			}),
		);
		fs.writeFileSync(
			path.join(userPkgRoot, "package.json"),
			JSON.stringify({
				name: "pkg-b",
				pi: { skills: ["./user-package-skills"] },
			}),
		);
		fs.writeFileSync(
			path.join(globalPkgRoot, "package.json"),
			JSON.stringify({
				name: "pkg-c",
				pi: { skills: ["./global-package-skills"] },
			}),
		);
		fs.writeFileSync(path.join(cwd, ".pi", "settings.json"), JSON.stringify({ skills: ["./custom/project-skill"] }));
		fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ skills: ["~/custom-user-skill"] }));

		skillsMocks.loadSkills.mockImplementation(({ skillPaths }: { skillPaths: string[] }) => {
			expect(skillPaths).toEqual(
				expect.arrayContaining([
					projectDefaultSkills,
					userDefaultSkills,
					path.join(projectPkgRoot, "package-skills"),
					path.join(userPkgRoot, "user-package-skills"),
					path.join(globalPkgRoot, "global-package-skills"),
					projectSettingsSkillDir,
					userSettingsSkillDir,
				]),
			);
			return {
				skills: [
					{
						name: "shared",
						filePath: path.join(agentDir, "skills", "shared", "SKILL.md"),
						source: "user",
						description: "User copy",
					},
					{
						name: "shared",
						filePath: path.join(cwd, ".pi", "skills", "shared", "SKILL.md"),
						source: "project",
						description: "Project copy",
					},
					{
						name: "pkg-project",
						filePath: path.join(projectPkgRoot, "package-skills", "pkg-project", "SKILL.md"),
						source: "package",
						description: "Project package",
					},
					{
						name: "pkg-user",
						filePath: path.join(userPkgRoot, "user-package-skills", "pkg-user", "SKILL.md"),
						source: "package",
						description: "User package",
					},
					{
						name: "pkg-global",
						filePath: path.join(globalPkgRoot, "global-package-skills", "pkg-global", "SKILL.md"),
						source: "package",
						description: "Global package",
					},
					{
						name: "settings-project",
						filePath: path.join(projectSettingsSkillDir, "SKILL.md"),
						source: "settings",
						description: "Project settings",
					},
					{
						name: "settings-user",
						filePath: path.join(userSettingsSkillDir, "SKILL.md"),
						source: "settings",
						description: "User settings",
					},
					{
						name: "builtin-skill",
						filePath: "/builtin/skill.md",
						source: "builtin",
						description: "Builtin",
					},
				],
			};
		});

		const available = discoverAvailableSkills(cwd);
		expect(available).toEqual([
			{ name: "builtin-skill", source: "builtin", description: "Builtin" },
			{
				name: "pkg-global",
				source: "user-package",
				description: "Global package",
			},
			{
				name: "pkg-project",
				source: "project-package",
				description: "Project package",
			},
			{ name: "pkg-user", source: "user-package", description: "User package" },
			{
				name: "settings-project",
				source: "project-settings",
				description: "Project settings",
			},
			{
				name: "settings-user",
				source: "unknown",
				description: "User settings",
			},
			{ name: "shared", source: "project", description: "Project copy" },
		]);
		expect(resolveSkillPath("shared", cwd)).toEqual({
			path: path.join(cwd, ".pi", "skills", "shared", "SKILL.md"),
			source: "project",
		});

		discoverAvailableSkills(cwd);
		expect(skillsMocks.loadSkills).toHaveBeenCalledTimes(1);
		clearSkillCache();
		discoverAvailableSkills(cwd);
		expect(skillsMocks.loadSkills).toHaveBeenCalledTimes(2);
	});

	it("reads skills, strips frontmatter, and reports missing skills", () => {
		const cwd = createTempDir("pi-subagent-skill-read-");
		const agentDir = createTempDir("pi-subagent-skill-read-agent-");
		skillsMocks.resolveAgentDir.mockReturnValue(agentDir);

		const sharedSkillFile = path.join(cwd, ".pi", "skills", "shared", "SKILL.md");
		const packageSkillFile = path.join(cwd, ".pi", "package-skill", "SKILL.md");
		fs.mkdirSync(path.dirname(sharedSkillFile), { recursive: true });
		fs.mkdirSync(path.dirname(packageSkillFile), { recursive: true });
		fs.writeFileSync(sharedSkillFile, "---\ndescription: test\n---\nProject instructions\n");
		fs.writeFileSync(packageSkillFile, "Package instructions\n");

		skillsMocks.loadSkills.mockReturnValue({
			skills: [
				{
					name: "shared",
					filePath: sharedSkillFile,
					source: "project",
					description: "Project",
				},
				{
					name: "package",
					filePath: packageSkillFile,
					source: "package",
					description: "Package",
				},
				{
					name: "broken",
					filePath: path.join(cwd, "missing", "SKILL.md"),
					source: "project",
				},
			],
		});

		const resolved = resolveSkills(["shared", "package", "missing", "broken"], cwd);
		expect(resolved.resolved).toEqual([
			{
				name: "shared",
				path: sharedSkillFile,
				content: "Project instructions",
				source: "project",
			},
			{
				name: "package",
				path: packageSkillFile,
				content: "Package instructions\n",
				source: "project-package",
			},
		]);
		expect(resolved.missing).toEqual(["missing", "broken"]);
	});

	it("resolves package skills through the default package manager", async () => {
		const cwd = createTempDir("subagents-package-skills-");
		const packageSkillFile = path.join(cwd, "node_modules", "@ifi", "oh-pi-skills", "skills", "devenv", "SKILL.md");
		fs.mkdirSync(path.dirname(packageSkillFile), { recursive: true });
		fs.writeFileSync(packageSkillFile, "Devenv instructions\n");

		skillsMocks.packageResolve.mockResolvedValue({
			skills: [
				{
					path: packageSkillFile,
					enabled: true,
					metadata: { scope: "project", origin: "package" },
				},
			],
		});
		skillsMocks.loadSkills.mockReturnValue({
			skills: [
				{
					name: "devenv",
					filePath: packageSkillFile,
					description: "Use devenv",
					sourceInfo: { scope: "project", origin: "package" },
				},
			],
		});

		const resolved = await resolveSkillsAsync(["devenv", "missing"], cwd);

		expect(skillsMocks.settingsCreate).toHaveBeenCalledWith(cwd, "/tmp/pi-agent");
		expect(skillsMocks.packageResolve).toHaveBeenCalledTimes(1);
		expect(skillsMocks.loadSkills).toHaveBeenCalledWith({
			cwd,
			agentDir: "/tmp/pi-agent",
			includeDefaults: false,
			skillPaths: [packageSkillFile],
		});
		expect(resolved).toEqual({
			resolved: [
				{
					name: "devenv",
					path: packageSkillFile,
					content: "Devenv instructions\n",
					source: "project-package",
				},
			],
			missing: ["missing"],
		});
	});
});
