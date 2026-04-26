import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

const PLAN_MODE_PROMPT_FILENAME = "PLAN.prompt.md";

function getBundledPromptPath(): string {
	return path.join(import.meta.dirname, "prompts", PLAN_MODE_PROMPT_FILENAME);
}

async function readNonEmptyFile(filePath: string): Promise<string | null> {
	try {
		const content = await readFile(filePath, "utf8");
		const trimmed = content.trim();
		return trimmed.length > 0 ? trimmed : null;
	} catch (error) {
		const { code } = error as NodeJS.ErrnoException;
		if (code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

export async function loadPlanModePrompt(options?: {
	agentDirPath?: string;
	bundledPromptPath?: string;
}): Promise<string> {
	const agentDirPath = options?.agentDirPath ?? getAgentDir();
	const bundledPromptPath = options?.bundledPromptPath ?? getBundledPromptPath();
	const overridePromptPath = path.join(agentDirPath, PLAN_MODE_PROMPT_FILENAME);

	const overridePrompt = await readNonEmptyFile(overridePromptPath);
	if (overridePrompt) {
		return overridePrompt;
	}

	const bundledPrompt = await readNonEmptyFile(bundledPromptPath);
	if (bundledPrompt) {
		return bundledPrompt;
	}

	throw new Error(`Plan mode prompt is missing or empty: ${bundledPromptPath}`);
}
