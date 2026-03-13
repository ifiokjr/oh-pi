export type PlanModeState = {
	version: number;
	active: boolean;
	originLeafId?: string;
	planFilePath?: string;
	lastPlanLeafId?: string;
};

export type TaskAgentTask = {
	id?: string;
	prompt: string;
	cwd?: string;
};

export type NormalizedTaskAgentTask = {
	id: string;
	prompt: string;
	cwd?: string;
};

export type TaskAgentActivityKind = "status" | "tool" | "assistant" | "toolResult" | "stderr";

export type TaskAgentActivity = {
	kind: TaskAgentActivityKind;
	text: string;
	timestamp: number;
};

export type TaskAgentTaskResult = {
	taskId: string;
	task: string;
	cwd: string;
	output: string;
	references: string[];
	exitCode: number;
	stderr: string;
	activities: TaskAgentActivity[];
	startedAt: number;
	finishedAt: number;
	steeringNotes: string[];
};

export type TaskAgentTaskProgress = {
	taskId: string;
	prompt: string;
	status: "queued" | "running" | "completed" | "failed";
	latestActivity?: string;
	activityCount: number;
};

export type TaskAgentRunDetails = {
	runId: string;
	tasks: TaskAgentTaskResult[];
	successCount: number;
	totalCount: number;
};

export type TaskAgentProgressDetails = {
	runId: string;
	completed: number;
	total: number;
	tasks: TaskAgentTaskProgress[];
};

export type TaskAgentRunRecord = {
	runId: string;
	createdAt: number;
	tasks: TaskAgentTaskResult[];
};

export type RequestUserInputOption = {
	label: string;
	description: string;
};

export type RequestUserInputQuestion = {
	id: string;
	header: string;
	question: string;
	options?: RequestUserInputOption[];
};

export type NormalizedRequestUserInputQuestion = Omit<RequestUserInputQuestion, "options"> & {
	options: RequestUserInputOption[];
};

export type RequestUserInputAnswer = {
	answers: string[];
};

export type RequestUserInputResponse = {
	answers: Record<string, RequestUserInputAnswer>;
};

export type RequestUserInputDetails = {
	questions: NormalizedRequestUserInputQuestion[];
	response: RequestUserInputResponse;
};
