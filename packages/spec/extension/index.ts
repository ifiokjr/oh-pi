import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { createGitClient } from "./git.js";
import { buildWorkflowPrompt, getStepNotes } from "./prompts.js";
import {
	ensureFeatureArtifacts,
	ensurePlanArtifact,
	ensureWorkflowScaffold,
	formatCreatedFiles,
	getWorkflowTemplatePath,
} from "./scaffold.js";
import {
	buildWorkflowStatus,
	formatFeatureList,
	formatHelpReport,
	formatWorkflowStatus,
	summarizeChecklists,
} from "./status.js";
import { SPEC_SUBCOMMANDS, type SpecSubcommand, type WorkflowPaths, type WorkflowStep } from "./types.js";
import {
	buildWorkflowPaths,
	findRepoRoot,
	getLatestFeatureDir,
	listFeatureDirs,
	prepareFeatureWorkspace,
	resolveFeatureFromBranch,
} from "./workspace.js";

const REPORT_MESSAGE_TYPE = "pi-spec-report";
const PROMPT_OPTIONAL_STEPS = new Set<WorkflowStep>(["clarify", "tasks", "analyze", "implement"]);

function tokenize(input: string): { subcommand: SpecSubcommand | null; remainder: string } {
	const trimmed = input.trim();
	if (!trimmed) {
		return { subcommand: "status", remainder: "" };
	}
	const [raw, ...rest] = trimmed.split(/\s+/);
	const normalized = raw.toLowerCase();
	if ((SPEC_SUBCOMMANDS as readonly string[]).includes(normalized)) {
		return { subcommand: normalized as SpecSubcommand, remainder: rest.join(" ").trim() };
	}
	return { subcommand: null, remainder: trimmed };
}

function sendReport(pi: ExtensionAPI, content: string): void {
	pi.sendMessage({ customType: REPORT_MESSAGE_TYPE, content, display: true });
}

function isWorkflowStep(subcommand: SpecSubcommand): subcommand is WorkflowStep {
	return ["constitution", "specify", "clarify", "checklist", "plan", "tasks", "analyze", "implement"].includes(
		subcommand,
	);
}

async function promptForMissingInput(
	ctx: ExtensionCommandContext,
	title: string,
	placeholder: string,
): Promise<string | undefined> {
	if (!ctx.hasUI) {
		return undefined;
	}
	if (typeof ctx.ui.editor === "function") {
		const response = await ctx.ui.editor(title, placeholder);
		return response?.trim() || undefined;
	}
	if (typeof ctx.ui.input === "function") {
		const response = await ctx.ui.input(title, placeholder);
		return response?.trim() || undefined;
	}
	return undefined;
}

function stepNeedsRequiredInput(step: WorkflowStep): boolean {
	return !PROMPT_OPTIONAL_STEPS.has(step);
}

async function resolveActiveFeatureName(
	ctx: ExtensionCommandContext,
	repoRoot: string,
	currentBranch: string,
	hasGit = true,
): Promise<string | undefined> {
	const featureFromBranch = resolveFeatureFromBranch(repoRoot, currentBranch);
	if (featureFromBranch) {
		return featureFromBranch;
	}

	// When git is available, the current branch is the source of truth for the
	// active feature — matching upstream spec-kit behavior.  The specs/ directory
	// scan is only a fallback for non-git repositories where branch detection is
	// unavailable.
	if (hasGit) {
		return undefined;
	}

	const features = listFeatureDirs(repoRoot);
	if (features.length === 0) {
		return undefined;
	}
	if (features.length === 1) {
		return features[0];
	}
	if (!ctx.hasUI || typeof ctx.ui.select !== "function") {
		return getLatestFeatureDir(repoRoot);
	}
	const selected = await ctx.ui.select("Select active spec feature", features);
	return selected || undefined;
}

async function resolveFeaturePaths(
	ctx: ExtensionCommandContext,
	repoRoot: string,
	currentBranch: string,
	hasGit = true,
): Promise<WorkflowPaths | undefined> {
	const featureName = await resolveActiveFeatureName(ctx, repoRoot, currentBranch, hasGit);
	if (!featureName) {
		ctx.ui.notify("No active feature found. Run /spec:specify <feature description> first.", "warning");
		return undefined;
	}
	return buildWorkflowPaths(repoRoot, featureName);
}

function queueWorkflow(
	pi: ExtensionAPI,
	step: WorkflowStep,
	currentBranch: string,
	paths: WorkflowPaths,
	input: string,
): void {
	const prompt = buildWorkflowPrompt({
		step,
		input,
		paths,
		currentBranch,
		workflowTemplatePath: getWorkflowTemplatePath(paths, step),
		stepNotes: getStepNotes(step),
		checklists: step === "implement" ? summarizeChecklists(paths.checklistsDir) : undefined,
	});
	pi.sendUserMessage(prompt);
}

async function collectStepInput(ctx: ExtensionCommandContext, step: WorkflowStep, existing: string): Promise<string> {
	if (existing.trim() || !stepNeedsRequiredInput(step)) {
		return existing.trim();
	}

	const titleByStep: Record<WorkflowStep, string> = {
		constitution: "Describe the constitution principles",
		specify: "Describe the feature to specify",
		clarify: "Optional clarification focus",
		checklist: "Optional checklist focus or domain",
		plan: "Describe the technical context",
		tasks: "Optional task-generation context",
		analyze: "Optional analysis focus",
		implement: "Optional implementation focus",
	};

	return (
		(await promptForMissingInput(ctx, titleByStep[step], "Write the details for this /spec step here")) ?? ""
	).trim();
}

function makeEnv(ctx: ExtensionCommandContext, git = createGitClient()) {
	const { repoRoot, hasGit } = findRepoRoot(ctx.cwd, git);
	const currentBranch = git.getCurrentBranch(repoRoot) ?? process.env.SPECIFY_FEATURE ?? "main";
	const basePaths = buildWorkflowPaths(repoRoot);
	return { git, repoRoot, hasGit, currentBranch, basePaths };
}

function handleInit(pi: ExtensionAPI, repoRoot: string, created: string[]): void {
	sendReport(
		pi,
		[
			"# /spec:init",
			"",
			`- Repository root: ${repoRoot}`,
			formatCreatedFiles(created),
			"",
			"Next: `/spec:constitution <principles>` or `/spec:specify <feature description>`.",
		].join("\n"),
	);
}

async function handleStatus(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	repoRoot: string,
	currentBranch: string,
	hasGit: boolean,
): Promise<void> {
	const activeFeature = await resolveActiveFeatureName(ctx, repoRoot, currentBranch, hasGit);
	sendReport(
		pi,
		formatWorkflowStatus(
			buildWorkflowStatus({
				repoRoot,
				currentBranch,
				paths: buildWorkflowPaths(repoRoot, activeFeature),
				activeFeature,
			}),
		),
	);
}

async function handleNext(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	repoRoot: string,
	currentBranch: string,
	hasGit: boolean,
): Promise<void> {
	const activeFeature = await resolveActiveFeatureName(ctx, repoRoot, currentBranch, hasGit);
	const status = buildWorkflowStatus({
		repoRoot,
		currentBranch,
		paths: buildWorkflowPaths(repoRoot, activeFeature),
		activeFeature,
	});
	sendReport(pi, `# Next /spec steps\n\n${status.nextSteps.map((step) => `- ${step}`).join("\n")}`);
}

function handleSpecify(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	env: ReturnType<typeof makeEnv>,
	input: string,
): void {
	if (!input) {
		ctx.ui.notify("/spec:specify requires a feature description.", "warning");
		return;
	}

	try {
		const prepared = prepareFeatureWorkspace({
			repoRoot: env.repoRoot,
			description: input,
			git: env.git,
			currentBranch: env.currentBranch,
			hasGit: env.hasGit,
		});
		const paths = buildWorkflowPaths(env.repoRoot, prepared.branchName);
		ensureWorkflowScaffold(paths);
		ensureFeatureArtifacts(paths);
		queueWorkflow(pi, "specify", prepared.branchName, paths, input);
		sendReport(
			pi,
			[
				"# /spec:specify",
				"",
				`- Feature branch: ${prepared.branchName}`,
				`- Feature number: ${prepared.featureNumber}`,
				`- Feature directory: ${prepared.featureDir}`,
				`- Spec file: ${prepared.specFile}`,
				"",
				"Queued the native specification workflow as a user message.",
			].join("\n"),
		);
	} catch (error) {
		ctx.ui.notify(
			`Failed to prepare feature workspace: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}

async function confirmChecklistOverride(ctx: ExtensionCommandContext, paths: WorkflowPaths): Promise<boolean> {
	const checklists = summarizeChecklists(paths.checklistsDir);
	if (
		!(checklists.some((checklist) => checklist.incomplete > 0) && ctx.hasUI && typeof ctx.ui.confirm === "function")
	) {
		return true;
	}

	const proceed = await ctx.ui.confirm(
		"Incomplete spec checklists",
		`${checklists.map((checklist) => `${checklist.name}: ${checklist.incomplete} incomplete item(s)`).join("\n")}

Proceed with implementation anyway?`,
	);
	if (!proceed) {
		ctx.ui.notify("Implementation cancelled until the checklist review is complete.", "info");
	}
	return proceed;
}

async function handleWorkflowStep(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	env: ReturnType<typeof makeEnv>,
	step: WorkflowStep,
	input: string,
): Promise<void> {
	if (step === "specify") {
		handleSpecify(pi, ctx, env, input);
		return;
	}

	const featurePaths =
		step === "constitution"
			? buildWorkflowPaths(
					env.repoRoot,
					await resolveActiveFeatureName(ctx, env.repoRoot, env.currentBranch, env.hasGit),
				)
			: await resolveFeaturePaths(ctx, env.repoRoot, env.currentBranch, env.hasGit);
	ensureWorkflowScaffold(featurePaths ?? env.basePaths);
	if (!featurePaths) {
		return;
	}

	if (step === "plan") {
		ensurePlanArtifact(featurePaths);
	}
	if (step === "implement" && !(await confirmChecklistOverride(ctx, featurePaths))) {
		return;
	}

	queueWorkflow(pi, step, env.currentBranch, featurePaths, input);
	ctx.ui.notify(`Queued /spec:${step} workflow.`, "info");
}

export default function specExtension(pi: ExtensionAPI) {
	pi.registerMessageRenderer(REPORT_MESSAGE_TYPE, (message, _options, theme) => {
		const text = `${theme.fg("accent", theme.bold("spec"))}\n\n${String(message.content ?? "")}`;
		return new Text(text, 0, 0);
	});

	const handleSpecCommand = async (rawArgs: string, ctx: ExtensionCommandContext): Promise<void> => {
		const { subcommand, remainder } = tokenize(rawArgs);
		if (!subcommand) {
			ctx.ui.notify(`Unknown /spec subcommand: ${rawArgs.trim()}`, "warning");
			sendReport(pi, formatHelpReport());
			return;
		}

		const env = makeEnv(ctx);
		if (subcommand === "init") {
			handleInit(pi, env.repoRoot, ensureWorkflowScaffold(env.basePaths));
			return;
		}
		if (subcommand === "help") {
			sendReport(pi, formatHelpReport());
			return;
		}
		if (subcommand === "list") {
			sendReport(pi, formatFeatureList(env.repoRoot));
			return;
		}
		if (subcommand === "status") {
			await handleStatus(pi, ctx, env.repoRoot, env.currentBranch, env.hasGit);
			return;
		}
		if (subcommand === "next") {
			await handleNext(pi, ctx, env.repoRoot, env.currentBranch, env.hasGit);
			return;
		}
		if (!isWorkflowStep(subcommand)) {
			sendReport(pi, formatHelpReport());
			return;
		}

		const input = await collectStepInput(ctx, subcommand, remainder);
		await handleWorkflowStep(pi, ctx, env, subcommand, input);
	};

	pi.registerCommand("spec", {
		description:
			"Native spec-kit workflow for pi (/spec:init|help|status|next|list|constitution|specify|clarify|checklist|plan|tasks|analyze|implement)",
		getArgumentCompletions(prefix) {
			const trimmed = prefix.trimStart();
			if (trimmed.includes(" ")) {
				return null;
			}
			const values = SPEC_SUBCOMMANDS.filter((command) => command.startsWith(trimmed)).map((command) => ({
				value: command,
				label: command,
			}));
			return values.length > 0 ? values : null;
		},
		handler: handleSpecCommand,
	});

	for (const subcommand of SPEC_SUBCOMMANDS) {
		pi.registerCommand(`spec:${subcommand}`, {
			description: `Alias for /spec:${subcommand}.`,
			handler: (args, ctx) => handleSpecCommand(args ? `${subcommand} ${args}` : subcommand, ctx),
		});
	}
}
