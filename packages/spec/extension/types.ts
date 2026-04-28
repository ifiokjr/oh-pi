/**
<!-- {=piSpecSubcommandsDocs} -->

Canonical `/spec` subcommands exposed by the extension. Keep README command lists and exported type metadata in sync with this source of truth: `status`, `help`, `init`, `constitution`, `specify`, `clarify`, `checklist`, `plan`, `tasks`, `analyze`, `implement`, `list`, and `next`.

<!-- {/piSpecSubcommandsDocs} -->
*/
export const SPEC_SUBCOMMANDS = [
	"status",
	"help",
	"init",
	"constitution",
	"specify",
	"clarify",
	"checklist",
	"plan",
	"tasks",
	"analyze",
	"implement",
	"list",
	"next",
] as const;

export type SpecSubcommand = (typeof SPEC_SUBCOMMANDS)[number];

/**
<!-- {=piSpecWorkflowStepsDocs} -->

Workflow steps that hand work back into pi for feature execution. These ordered steps are `constitution`, `specify`, `clarify`, `checklist`, `plan`, `tasks`, `analyze`, and `implement`. Keep contributor-facing docs aligned with the same sequence.

<!-- {/piSpecWorkflowStepsDocs} -->
*/
export const WORKFLOW_STEPS = [
	"constitution",
	"specify",
	"clarify",
	"checklist",
	"plan",
	"tasks",
	"analyze",
	"implement",
] as const;

export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export interface WorkflowPaths {
	repoRoot: string;
	specsDir: string;
	specifyDir: string;
	templatesDir: string;
	memoryDir: string;
	constitutionFile: string;
	agentContextFile: string;
	extensionsConfigFile: string;
	workflowReadmeFile: string;
	featureDir?: string;
	featureBranch?: string;
	featureNumber?: string;
	featureSpec?: string;
	planFile?: string;
	tasksFile?: string;
	researchFile?: string;
	dataModelFile?: string;
	quickstartFile?: string;
	contractsDir?: string;
	checklistsDir?: string;
}

export interface WorkflowStatus {
	initialized: boolean;
	repoRoot: string;
	currentBranch: string;
	featureDirs: string[];
	activeFeature?: string;
	paths: WorkflowPaths;
	artifacts: { label: string; path: string; exists: boolean }[];
	checklists: ChecklistSummary[];
	nextSteps: string[];
}

export interface ChecklistSummary {
	name: string;
	path: string;
	total: number;
	completed: number;
	incomplete: number;
	status: "pass" | "fail";
}

export interface PreparedFeature {
	branchName: string;
	featureNumber: string;
	featureDir: string;
	specFile: string;
	checklistsDir: string;
	createdBranch: boolean;
}

export interface WorkflowPromptContext {
	step: WorkflowStep;
	input: string;
	paths: WorkflowPaths;
	currentBranch: string;
	workflowTemplatePath: string;
	stepNotes: string[];
	checklists?: ChecklistSummary[];
}
