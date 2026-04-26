import { Type } from "@sinclair/typebox";

export const TaskSchema = Type.Object(
	{
		cwd: Type.Optional(Type.String({ description: "Optional working directory for this task." })),
		id: Type.Optional(
			Type.String({
				description: "Optional stable task ID (e.g. auth-scan) for tracing and steering.",
			}),
		),
		prompt: Type.String({ description: "Task prompt for the delegated task agent." }),
	},
	{ additionalProperties: false },
);

export const TaskAgentsSchema = Type.Object(
	{
		concurrency: Type.Optional(
			Type.Integer({
				minimum: 1,
				maximum: 4,
				description: "How many tasks to run in parallel (default: 2).",
			}),
		),
		tasks: Type.Array(TaskSchema, {
			minItems: 1,
			maxItems: 6,
			description: "One or more tasks to run via isolated task agents.",
		}),
	},
	{ additionalProperties: false },
);

export const SteerTaskAgentSchema = Type.Object(
	{
		instruction: Type.String({ description: "Additional steering instruction for the selected task." }),
		runId: Type.String({ description: "Run ID from a previous task_agents result." }),
		taskId: Type.String({ description: "Task ID from that run to rerun with steering." }),
	},
	{ additionalProperties: false },
);

export const SetPlanSchema = Type.Object(
	{
		plan: Type.String({
			description:
				"Full plan document text. This overwrites the current plan file and should include the complete latest plan.",
		}),
	},
	{ additionalProperties: false },
);

export const RequestUserInputOptionSchema = Type.Object(
	{
		description: Type.String({ description: "One short sentence explaining impact/tradeoff if selected." }),
		label: Type.String({ description: "User-facing label (1-5 words)." }),
	},
	{ additionalProperties: false },
);

export const RequestUserInputQuestionSchema = Type.Object(
	{
		header: Type.String({ description: "Short header label shown in the UI (12 or fewer chars)." }),
		id: Type.String({ description: "Stable identifier for mapping answers (snake_case)." }),
		options: Type.Optional(
			Type.Array(RequestUserInputOptionSchema, {
				description:
					"Optional multiple-choice options. When omitted or empty, the question is treated as open-ended and accepts freeform input.",
			}),
		),
		question: Type.String({ description: "Single-sentence prompt shown to the user." }),
	},
	{ additionalProperties: false },
);

export const RequestUserInputSchema = Type.Object(
	{
		questions: Type.Array(RequestUserInputQuestionSchema, {
			description: "Questions to show the user. Prefer 1 and do not exceed 3.",
			maxItems: 3,
			minItems: 1,
		}),
	},
	{ additionalProperties: false },
);
