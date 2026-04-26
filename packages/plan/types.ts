export interface PlanModeState {
	version: number;
	active: boolean;
	originLeafId?: string;
	planFilePath?: string;
	lastPlanLeafId?: string;
}

export interface TaskAgentTask {
	id?: string;
	prompt: string;
	cwd?: string;
}

export interface NormalizedTaskAgentTask {
	id: string;
	prompt: string;
	cwd?: string;
}

export type TaskAgentActivityKind = "status" | "tool" | "assistant" | "toolResult" | "stderr";

export interface TaskAgentActivity {
	kind: TaskAgentActivityKind;
	text: string;
	timestamp: number;
}

export interface TaskAgentTaskResult {
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
}

export interface TaskAgentTaskProgress {
	taskId: string;
	prompt: string;
	status: "queued" | "running" | "completed" | "failed";
	latestActivity?: string;
	activityCount: number;
}

export interface TaskAgentRunDetails {
	runId: string;
	tasks: TaskAgentTaskResult[];
	successCount: number;
	totalCount: number;
}

export interface TaskAgentProgressDetails {
	runId: string;
	completed: number;
	total: number;
	tasks: TaskAgentTaskProgress[];
}

export interface TaskAgentRunRecord {
	runId: string;
	createdAt: number;
	tasks: TaskAgentTaskResult[];
}

export interface RequestUserInputOption {
	label: string;
	description: string;
}

export interface RequestUserInputQuestion {
	id: string;
	header: string;
	question: string;
	options?: RequestUserInputOption[];
}

export type NormalizedRequestUserInputQuestion = Omit<RequestUserInputQuestion, "options"> & {
	options: RequestUserInputOption[];
};

export interface RequestUserInputAnswer {
	answers: string[];
}

export interface RequestUserInputResponse {
	answers: Record<string, RequestUserInputAnswer>;
}

export interface RequestUserInputDetails {
	questions: NormalizedRequestUserInputQuestion[];
	response: RequestUserInputResponse;
}
