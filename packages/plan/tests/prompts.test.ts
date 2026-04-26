import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadPlanModePrompt } from "../prompts";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		await rm(dir, { force: true, recursive: true });
	}
});

async function createPromptPaths() {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-prompts-"));
	tempDirs.push(tempDir);

	const agentDirPath = path.join(tempDir, "agent");
	await mkdir(agentDirPath, { recursive: true });

	const bundledPromptPath = path.join(tempDir, "bundled", "PLAN.prompt.md");
	await mkdir(path.dirname(bundledPromptPath), { recursive: true });

	return {
		agentDirPath,
		bundledPromptPath,
	};
}

describe(loadPlanModePrompt, () => {
	it("loads bundled prompt when override is missing", async () => {
		const paths = await createPromptPaths();
		await writeFile(paths.bundledPromptPath, "bundled prompt\n", "utf8");

		const prompt = await loadPlanModePrompt(paths);
		expect(prompt).toBe("bundled prompt");
	});

	it("prefers override prompt when present", async () => {
		const paths = await createPromptPaths();
		await writeFile(paths.bundledPromptPath, "bundled prompt\n", "utf8");
		await writeFile(path.join(paths.agentDirPath, "PLAN.prompt.md"), "override prompt\n", "utf8");

		const prompt = await loadPlanModePrompt(paths);
		expect(prompt).toBe("override prompt");
	});

	it("falls back to bundled prompt when override is blank", async () => {
		const paths = await createPromptPaths();
		await writeFile(paths.bundledPromptPath, "bundled prompt\n", "utf8");
		await writeFile(path.join(paths.agentDirPath, "PLAN.prompt.md"), "  \n\t\n", "utf8");

		const prompt = await loadPlanModePrompt(paths);
		expect(prompt).toBe("bundled prompt");
	});

	it("bundled prompt tells the model to put the goal at the top of the plan", async () => {
		const paths = await createPromptPaths();
		const prompt = await loadPlanModePrompt({
			agentDirPath: paths.agentDirPath,
			bundledPromptPath: fileURLToPath(new URL("../prompts/PLAN.prompt.md", import.meta.url)),
		});

		expect(prompt).toContain("Include the goal at the top of the plan.");
	});
});
