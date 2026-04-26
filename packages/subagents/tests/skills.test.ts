import fs from "node:fs";
import os from "node:os";
import path from "node:path";


const skillsMocks = vi.hoisted(() => ({
	execSync: vi.fn(() => "/tmp/global-node-modules\n"),
	expandHomeDir: vi.fn((value: string) => value.replace(/^~\//, "/tmp/home/")),
	loadSkills: vi.fn(() => ({ skills: [] })),
	resolveAgentDir: vi.fn(() => "/tmp/pi-agent"),
}));

vi.mock<typeof import('node:child_process')>(import('node:child_process'), () => ({
	execSync: skillsMocks.execSync,
}));

vi.mock<typeof import('@ifi/oh-pi-core')>(import('@ifi/oh-pi-core'), () => ({
	expandHomeDir: skillsMocks.expandHomeDir,
}));

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({
	loadSkills: skillsMocks.loadSkills,
}));

vi.mock<typeof import('../paths.js')>(import('../paths.js'), () => ({
	resolveAgentDir: skillsMocks.resolveAgentDir,
}));

import {
	buildSkillInjection,
	clearSkillCache,
	discoverAvailableSkills,
	normalizeSkillInput,
	resolveSkillPath,
	resolveSkills,
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
		fs.rmSync(dir, { force: true, recursive: true });
	}
	tempDirs.length = 0;
});

describe("subagent skills", () => {
	it("normalizes skill input formats and builds injections", () => {
		expect(normalizeSkillInput(false)).toBeFalsy();
		expect(normalizeSkillInput(true)).toBeUndefined();
		expect(normalizeSkillInput([" git ", "git", "context7"])).toStrictEqual(["git", "context7"]);
		expect(normalizeSkillInput('["git","context7"]')).toStrictEqual(["git", "context7"]);
		expect(normalizeSkillInput("git, context7, git")).toStrictEqual(["git", "context7"]);
		expect(
			buildSkillInjection([
				{ content: "Use git carefully.", name: "git", path: "/skills/git.md", source: "project" },
				{ content: "Query docs first.", name: "context7", path: "/skills/context7.md", source: "user" },
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
			JSON.stringify({ name: "@scope/pkg-a", pi: { skills: ["./package-skills"] } }),
		);
		fs.writeFileSync(
			path.join(userPkgRoot, "package.json"),
			JSON.stringify({ name: "pkg-b", pi: { skills: ["./user-package-skills"] } }),
		);
		fs.writeFileSync(
			path.join(globalPkgRoot, "package.json"),
			JSON.stringify({ name: "pkg-c", pi: { skills: ["./global-package-skills"] } }),
		);
		fs.writeFileSync(path.join(cwd, ".pi", "settings.json"), JSON.stringify({ skills: ["./custom/project-skill"] }));
		fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ skills: ["~/custom-user-skill"] }));

		skillsMocks.loadSkills.mockImplementation(({ skillPaths }: { skillPaths: string[] }) => {
			expect(skillPaths).toStrictEqual(
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
						description: "User copy",
						filePath: path.join(agentDir, "skills", "shared", "SKILL.md"),
						name: "shared",
						source: "user",
					},
					{
						description: "Project copy",
						filePath: path.join(cwd, ".pi", "skills", "shared", "SKILL.md"),
						name: "shared",
						source: "project",
					},
					{
						description: "Project package",
						filePath: path.join(projectPkgRoot, "package-skills", "pkg-project", "SKILL.md"),
						name: "pkg-project",
						source: "package",
					},
					{
						description: "User package",
						filePath: path.join(userPkgRoot, "user-package-skills", "pkg-user", "SKILL.md"),
						name: "pkg-user",
						source: "package",
					},
					{
						description: "Global package",
						filePath: path.join(globalPkgRoot, "global-package-skills", "pkg-global", "SKILL.md"),
						name: "pkg-global",
						source: "package",
					},
					{
						description: "Project settings",
						filePath: path.join(projectSettingsSkillDir, "SKILL.md"),
						name: "settings-project",
						source: "settings",
					},
					{
						description: "User settings",
						filePath: path.join(userSettingsSkillDir, "SKILL.md"),
						name: "settings-user",
						source: "settings",
					},
					{
						description: "Builtin",
						filePath: "/builtin/skill.md",
						name: "builtin-skill",
						source: "builtin",
					},
				],
			};
		});

		const available = discoverAvailableSkills(cwd);
		expect(available).toStrictEqual([
			{ description: "Builtin", name: "builtin-skill", source: "builtin" },
			{ description: "Global package", name: "pkg-global", source: "user-package" },
			{ description: "Project package", name: "pkg-project", source: "project-package" },
			{ description: "User package", name: "pkg-user", source: "user-package" },
			{ description: "Project settings", name: "settings-project", source: "project-settings" },
			{ description: "User settings", name: "settings-user", source: "unknown" },
			{ description: "Project copy", name: "shared", source: "project" },
		]);
		expect(resolveSkillPath("shared", cwd)).toStrictEqual({
			path: path.join(cwd, ".pi", "skills", "shared", "SKILL.md"),
			source: "project",
		});

		discoverAvailableSkills(cwd);
		expect(skillsMocks.loadSkills).toHaveBeenCalledOnce();
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
				{ description: "Project", filePath: sharedSkillFile, name: "shared", source: "project" },
				{ description: "Package", filePath: packageSkillFile, name: "package", source: "package" },
				{ filePath: path.join(cwd, "missing", "SKILL.md"), name: "broken", source: "project" },
			],
		});

		const resolved = resolveSkills(["shared", "package", "missing", "broken"], cwd);
		expect(resolved.resolved).toStrictEqual([
			{ content: "Project instructions", name: "shared", path: sharedSkillFile, source: "project" },
			{ content: "Package instructions\n", name: "package", path: packageSkillFile, source: "project-package" },
		]);
		expect(resolved.missing).toStrictEqual(["missing", "broken"]);
	});
});
