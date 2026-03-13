import { Type } from "@sinclair/typebox";

export const TaskSchema = Type.Object(
	{
		id: Type.Optional(
			Type.String({
				description: "Optional stable task ID (e.g. auth-scan) for tracing and steering.",
			}),
		),
		prompt: Type.String({ description: "Task prompt for the delegated task agent." }),
		cwd: Type.Optional(Type.String({ description: "Optional working directory for this task." })),
	},
	{ additionalProperties: false },
);

export const TaskAgentsSchema = Type.Object(
	{
		tasks: Type.Array(TaskSchema, {
			minItems: 1,
			maxItems: 6,
			description: "One or more tasks to run via isolated task agents.",
		}),
		concurrency: Type.Optional(
			Type.Integer({
				minimum: 1,
				maximum: 4,
				description: "How many tasks to run in parallel (default: 2).",
			}),
		),
	},
	{ additionalProperties: false },
);

export const SteerTaskAgentSchema = Type.Object(
	{
		runId: Type.String({ description: "Run ID from a previous task_agents result." }),
		taskId: Type.String({ description: "Task ID from that run to rerun with steering." }),
		instruction: Type.String({ description: "Additional steering instruction for the selected task." }),
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
		label: Type.String({ description: "User-facing label (1-5 words)." }),
		description: Type.String({ description: "One short sentence explaining impact/tradeoff if selected." }),
	},
	{ additionalProperties: false },
);

export const RequestUserInputQuestionSchema = Type.Object(
	{
		id: Type.String({ description: "Stable identifier for mapping answers (snake_case)." }),
		header: Type.String({ description: "Short header label shown in the UI (12 or fewer chars)." }),
		question: Type.String({ description: "Single-sentence prompt shown to the user." }),
		options: Type.Optional(
			Type.Array(RequestUserInputOptionSchema, {
				description:
					'Optional multiple-choice options. When omitted or empty, the question is treated as open-ended and accepts freeform input.',
			}),
		),
	},
	{ additionalProperties: false },
);

export const RequestUserInputSchema = Type.Object(
	{
		questions: Type.Array(RequestUserInputQuestionSchema, {
			minItems: 1,
			maxItems: 3,
			description: "Questions to show the user. Prefer 1 and do not exceed 3.",
		}),
	},
	{ additionalProperties: false },
);
