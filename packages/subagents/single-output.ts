import * as fs from "node:fs";
import * as path from "node:path";

export function resolveSingleOutputPath(
	output: string | false | undefined,
	runtimeCwd: string,
	requestedCwd?: string,
): string | undefined {
	if (typeof output !== "string" || !output) {
		return undefined;
	}
	if (path.isAbsolute(output)) {
		return output;
	}
	const baseCwd = requestedCwd
		? path.isAbsolute(requestedCwd)
			? requestedCwd
			: path.resolve(runtimeCwd, requestedCwd)
		: runtimeCwd;
	return path.resolve(baseCwd, output);
}

export function injectSingleOutputInstruction(task: string, outputPath: string | undefined): string {
	if (!outputPath) {
		return task;
	}
	return `${task}\n\n---\n**Output:** Write your findings to: ${outputPath}`;
}

export function persistSingleOutput(
	outputPath: string | undefined,
	fullOutput: string,
): { savedPath?: string; error?: string } {
	if (!outputPath) {
		return {};
	}
	try {
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, fullOutput, "utf8");
		return { savedPath: outputPath };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

export function finalizeSingleOutput(params: {
	fullOutput: string;
	truncatedOutput?: string;
	outputPath?: string;
	exitCode: number;
}): { displayOutput: string; savedPath?: string; saveError?: string } {
	let displayOutput = params.truncatedOutput || params.fullOutput;
	if (params.outputPath && params.exitCode === 0) {
		const save = persistSingleOutput(params.outputPath, params.fullOutput);
		if (save.savedPath) {
			displayOutput += `\n\n📄 Output saved to: ${save.savedPath}`;
			return { displayOutput, savedPath: save.savedPath };
		}
		if (save.error) {
			displayOutput += `\n\n[!] Failed to save output to: ${params.outputPath}\n${save.error}`;
			return { displayOutput, saveError: save.error };
		}
	}
	return { displayOutput };
}
