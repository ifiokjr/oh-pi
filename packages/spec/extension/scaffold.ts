import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkflowPaths } from "./types.js";

const WORKFLOW_README = `# Native /spec Workflow

This project uses the native pi spec workflow inspired by GitHub spec-kit.

## Core commands

- /spec init
- /spec constitution <principles>
- /spec specify <feature description>
- /spec clarify [focus]
- /spec checklist [domain]
- /spec plan <technical context>
- /spec tasks [context]
- /spec analyze [focus]
- /spec implement [focus]
- /spec status
- /spec next

## Runtime notes

- The pi extension handles feature numbering, branch naming, path resolution, and file scaffolding in TypeScript.
- Workflow templates live in .specify/templates/commands/ and can be customized per project.
- File templates live in .specify/templates/.
- The native replacement for agent-specific context files is .specify/memory/pi-agent.md.
- Feature artifacts live in specs/###-feature-name/.
`.replaceAll("/spec ", "/spec:");

const DEFAULT_EXTENSIONS_YML = `settings:
  auto_execute_hooks: true
hooks: {}
`;

function getExtensionRoot(): string {
	return import.meta.dirname;
}

function getBundledTemplatesRoot(): string {
	return path.join(getExtensionRoot(), "assets", "templates");
}

function ensureDir(dir: string): void {
	mkdirSync(dir, { recursive: true });
}

function copyDirIfMissing(sourceDir: string, targetDir: string): void {
	ensureDir(targetDir);
	for (const entry of readdirSync(sourceDir)) {
		const sourcePath = path.join(sourceDir, entry);
		const targetPath = path.join(targetDir, entry);
		const sourceStat = statSync(sourcePath);
		if (sourceStat.isDirectory()) {
			copyDirIfMissing(sourcePath, targetPath);
			continue;
		}
		if (!existsSync(targetPath)) {
			copyFileSync(sourcePath, targetPath);
		}
	}
}

export function ensureWorkflowScaffold(paths: WorkflowPaths): string[] {
	const created: string[] = [];
	ensureDir(paths.specifyDir);
	ensureDir(paths.specsDir);
	ensureDir(paths.templatesDir);
	ensureDir(paths.memoryDir);

	const beforeTemplates = new Set<string>();
	if (existsSync(paths.templatesDir)) {
		for (const entry of readdirSync(paths.templatesDir)) {
			beforeTemplates.add(entry);
		}
	}

	copyDirIfMissing(getBundledTemplatesRoot(), paths.templatesDir);

	for (const entry of readdirSync(paths.templatesDir)) {
		if (!beforeTemplates.has(entry)) {
			created.push(path.join(paths.templatesDir, entry));
		}
	}

	if (!existsSync(paths.workflowReadmeFile)) {
		writeFileSync(paths.workflowReadmeFile, WORKFLOW_README, "utf8");
		created.push(paths.workflowReadmeFile);
	}
	if (!existsSync(paths.extensionsConfigFile)) {
		writeFileSync(paths.extensionsConfigFile, DEFAULT_EXTENSIONS_YML, "utf8");
		created.push(paths.extensionsConfigFile);
	}
	if (!existsSync(paths.constitutionFile)) {
		const template = readFileSync(path.join(paths.templatesDir, "constitution-template.md"), "utf8");
		writeFileSync(paths.constitutionFile, template, "utf8");
		created.push(paths.constitutionFile);
	}
	if (!existsSync(paths.agentContextFile)) {
		const template = readFileSync(path.join(paths.templatesDir, "agent-file-template.md"), "utf8");
		writeFileSync(paths.agentContextFile, template, "utf8");
		created.push(paths.agentContextFile);
	}

	return created;
}

export function ensureFeatureArtifacts(paths: WorkflowPaths): string[] {
	if (!(paths.featureDir && paths.featureSpec && paths.checklistsDir)) {
		return [];
	}

	const created: string[] = [];
	ensureDir(paths.featureDir);
	ensureDir(paths.checklistsDir);
	if (!existsSync(paths.featureSpec)) {
		const template = readFileSync(path.join(paths.templatesDir, "spec-template.md"), "utf8");
		writeFileSync(paths.featureSpec, template, "utf8");
		created.push(paths.featureSpec);
	}
	return created;
}

export function ensurePlanArtifact(paths: WorkflowPaths): string[] {
	if (!(paths.featureDir && paths.planFile && paths.contractsDir)) {
		return [];
	}

	const created: string[] = [];
	ensureDir(paths.featureDir);
	ensureDir(paths.contractsDir);
	if (!existsSync(paths.planFile)) {
		const template = readFileSync(path.join(paths.templatesDir, "plan-template.md"), "utf8");
		writeFileSync(paths.planFile, template, "utf8");
		created.push(paths.planFile);
	}
	return created;
}

export function getWorkflowTemplatePath(paths: WorkflowPaths, name: string): string {
	return path.join(paths.templatesDir, "commands", `${name}.md`);
}

export function formatCreatedFiles(created: string[]): string {
	if (created.length === 0) {
		return "No new scaffold files were needed.";
	}
	return `Created ${created.length} scaffold file(s):\n${created.map((file) => `- ${file}`).join("\n")}`;
}
