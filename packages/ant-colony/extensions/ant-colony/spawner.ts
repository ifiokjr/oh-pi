/**
 * Ant Spawner — each ant is an in-process AgentSession (SDK)
 *
 * Replaces the old `pi --mode json` child-process approach:
 * - Zero startup overhead (same process)
 * - Real-time token streaming (session.subscribe)
 * - Shared auth & model registry
 */

import { getModel } from "@mariozechner/pi-ai";
import {
	AuthStorage,
	createAgentSession,
	createBashTool,
	createEditTool,
	createExtensionRuntime,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { AgentSession, AgentSessionEvent, ResourceLoader } from "@mariozechner/pi-coding-agent";
import type { Nest } from "./nest.js";
import { extractPheromones, parseSubTasks } from "./parser.js";
import type { ParsedSubTask } from "./parser.js";
import { buildPrompt, CASTE_PROMPTS } from "./prompts.js";
import type { Ant, AntCaste, AntConfig, AntStreamEvent, AntUsageEvent, DroneCommandPolicy, Task } from "./types.js";

let antCounter = 0;

export function resetAntCounter(): void {
	antCounter = 0;
}

export function makeAntId(caste: AntCaste): string {
	return `${caste}-${++antCounter}-${Date.now().toString(36)}`;
}

export function makePheromoneId(): string {
	return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function makeTaskId(): string {
	return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface AntResult {
	ant: Ant;
	output: string;
	newTasks: ParsedSubTask[];
	pheromones: import("./types.js").Pheromone[];
	rateLimited: boolean;
}

const DRONE_COMMAND_POLICY: DroneCommandPolicy = {
	allowlist: ["npm", "pnpm", "yarn", "npx", "node", "git", "ls", "cat", "echo"],
	maxArgs: 24,
	maxCommandLength: 240,
};

const BLOCKED_DRONE_TOKENS = /(?:[;&|`$<>]|\$\(|\|\||&&)/;
const DRONE_CODE_FENCE_RE = /```(?:bash|sh)?\s*\n?([\s\S]*?)```/;

function extractDroneCommand(task: Task): string {
	const ctxMatch = DRONE_CODE_FENCE_RE.exec(task.context ?? "");
	return ctxMatch?.[1]?.trim() || task.description.trim();
}

function parseCommandArgv(command: string): string[] {
	const argv: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escaping = false;
	for (const ch of command) {
		if (escaping) {
			current += ch;
			escaping = false;
			continue;
		}
		if (ch === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (ch === quote) {
				quote = null;
			} else {
				current += ch;
			}
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (/\s/.test(ch)) {
			if (current.length > 0) {
				argv.push(current);
				current = "";
			}
			continue;
		}
		current += ch;
	}
	if (quote) {
		throw new Error("Drone command rejected: unclosed quote");
	}
	if (escaping) {
		throw new Error("Drone command rejected: trailing escape");
	}
	if (current.length > 0) {
		argv.push(current);
	}
	return argv;
}

function validateDroneCommand(command: string, policy: DroneCommandPolicy): string[] {
	if (!command) {
		throw new Error("Drone command rejected: empty command");
	}
	if (command.length > policy.maxCommandLength) {
		throw new Error(`Drone command rejected: exceeds ${policy.maxCommandLength} chars`);
	}
	if (BLOCKED_DRONE_TOKENS.test(command)) {
		throw new Error("Drone command rejected: shell metacharacters are not allowed");
	}
	const argv = parseCommandArgv(command);
	if (argv.length === 0) {
		throw new Error("Drone command rejected: empty argv");
	}
	if (argv.length - 1 > policy.maxArgs) {
		throw new Error(`Drone command rejected: too many args (max ${policy.maxArgs})`);
	}
	const executable = argv[0];
	if (!policy.allowlist.includes(executable)) {
		throw new Error(`Drone command rejected: executable '${executable}' is not allowlisted`);
	}
	return argv;
}

// Re-export for queen.ts compatibility
export type { ParsedSubTask } from "./parser.js";

/** Create tool instances for the given caste's allowed tool names. */
function createToolsForCaste(cwd: string, toolNames: string[]) {
	// Biome-ignore lint/suspicious/noExplicitAny: Tool factory return types vary across the SDK
	const toolMap: Record<string, (cwd: string) => unknown> = {
		bash: createBashTool,
		edit: createEditTool,
		find: createFindTool,
		grep: createGrepTool,
		ls: createLsTool,
		read: createReadTool,
		write: createWriteTool,
	};
	return toolNames.map((name) => toolMap[name]?.(cwd)).filter(Boolean);
}

/** Parse a "provider/model-id" model string and resolve it from the registry. */
function resolveModel(modelStr: string, modelRegistry: ModelRegistry) {
	const slashIdx = modelStr.indexOf("/");
	if (slashIdx > 0) {
		const provider = modelStr.slice(0, slashIdx);
		const id = modelStr.slice(slashIdx + 1);
		return modelRegistry.find(provider, id) || getModel(provider, id);
	}
	for (const provider of ["anthropic", "openai", "google"]) {
		const m = modelRegistry.find(provider, modelStr) || getModel(provider, modelStr);
		if (m) {
			return m;
		}
	}
	return null;
}

function modelIdentity(modelStr: string): { provider: string; model: string } {
	const slashIdx = modelStr.indexOf("/");
	if (slashIdx > 0) {
		return {
			model: modelStr.slice(slashIdx + 1),
			provider: modelStr.slice(0, slashIdx),
		};
	}
	return { model: modelStr, provider: "unknown" };
}

function toNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Minimal ResourceLoader for ant sessions — ants don't load extensions or skills. */
function makeMinimalResourceLoader(systemPrompt: string): ResourceLoader {
	return {
		getExtensions: () => ({
			errors: [],
			extensions: [],
			runtime: createExtensionRuntime(),
		}),
		getSkills: () => ({ diagnostics: [], skills: [] }),
		getPrompts: () => ({ diagnostics: [], prompts: [] }),
		getThemes: () => ({ diagnostics: [], themes: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => systemPrompt,
		getAppendSystemPrompt: () => [],
		getPathMetadata: () => new Map(),
		// Biome-ignore lint/suspicious/noEmptyBlockStatements: No-op required by ResourceLoader interface
		extendResources: () => {},
		// Biome-ignore lint/suspicious/noEmptyBlockStatements: No-op required by ResourceLoader interface
		reload: async () => {},
	};
}

/**
 * Run a drone — pure rule execution with zero LLM cost.
 */
export async function runDrone(cwd: string, nest: Nest, task: Task): Promise<AntResult> {
	const antId = makeAntId("drone");
	const ant: Ant = {
		caste: "drone",
		finishedAt: null,
		id: antId,
		model: "none",
		pid: null,
		startedAt: Date.now(),
		status: "working",
		taskId: task.id,
		usage: { cost: 0, input: 0, output: 0, turns: 1 },
	};
	nest.updateAnt(ant);
	nest.updateTaskStatus(task.id, "active");

	try {
		const { execFileSync } = await import("node:child_process");
		const command = extractDroneCommand(task);
		const argv = validateDroneCommand(command, DRONE_COMMAND_POLICY);
		const [file, ...args] = argv;
		const output = execFileSync(file, args, {
			cwd,
			encoding: "utf-8",
			stdio: "pipe",
			timeout: 30000,
		}).trim();

		ant.status = "done";
		ant.finishedAt = Date.now();
		nest.updateAnt(ant);
		nest.updateTaskStatus(task.id, "done", `## Completed\n${output || "(no output)"}`);
		nest.dropPheromone({
			antCaste: "drone",
			antId,
			content: `Drone executed: ${command.slice(0, 100)}`,
			createdAt: Date.now(),
			files: task.files,
			id: makePheromoneId(),
			strength: 1,
			taskId: task.id,
			type: "completion",
		});
		return { ant, newTasks: [], output, pheromones: [], rateLimited: false };
	} catch (error: unknown) {
		const err = error as { stderr?: Buffer | string };
		const errStr = err.stderr?.toString() || String(error);
		ant.status = "failed";
		ant.finishedAt = Date.now();
		nest.updateAnt(ant);
		nest.updateTaskStatus(task.id, "failed", undefined, errStr.slice(0, 500));
		return {
			ant,
			newTasks: [],
			output: errStr,
			pheromones: [],
			rateLimited: false,
		};
	}
}

/**
 * Spawn and run a single ant as an in-process AgentSession.
 * Handles prompt construction, session lifecycle, token streaming,
 * pheromone extraction, and sub-task parsing from the ant's output.
 */
// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Ant lifecycle spans session setup, streaming, error handling, and cleanup
export async function spawnAnt(
	cwd: string,
	nest: Nest,
	task: Task,
	antConfig: Omit<AntConfig, "systemPrompt">,
	signal?: AbortSignal,
	onStream?: (event: AntStreamEvent) => void,
	onUsage?: (event: AntUsageEvent) => void,
	authStorage?: AuthStorage,
	modelRegistry?: ModelRegistry,
	budgetPromptSection?: string,
): Promise<AntResult> {
	if (!antConfig.model) {
		throw new Error("No model resolved for ant");
	}
	const antId = makeAntId(antConfig.caste);
	const ant: Ant = {
		caste: antConfig.caste,
		finishedAt: null,
		id: antId,
		model: antConfig.model,
		pid: null,
		startedAt: Date.now(),
		status: "working",
		taskId: task.id,
		usage: { cost: 0, input: 0, output: 0, turns: 0 },
	};

	nest.updateAnt(ant);
	nest.updateTaskStatus(task.id, "active");

	// Bio 2: Task difficulty awareness — dynamic maxTurns
	const warnings = nest.countWarnings(task.files);
	const difficultyTurns = Math.min(25, (antConfig.maxTurns || 15) + task.files.length + warnings * 2);
	const effectiveMaxTurns = antConfig.caste === "drone" ? 1 : difficultyTurns;

	// Bio 3: Tandem foraging — inherit parent task result and prior failure error
	const tandem: { parentResult?: string; priorError?: string } = {};
	if (task.parentId) {
		const parent = nest.getTask(task.parentId);
		if (parent?.result) {
			tandem.parentResult = parent.result;
		}
	}
	if (task.error) {
		tandem.priorError = task.error;
	}

	const pheromoneCtx = nest.getPheromoneContext(task.files);
	const castePrompt = CASTE_PROMPTS[antConfig.caste];
	const systemPrompt = buildPrompt(task, pheromoneCtx, castePrompt, effectiveMaxTurns, tandem, budgetPromptSection);

	const auth = authStorage ?? new AuthStorage();
	const registry = modelRegistry ?? new ModelRegistry(auth);
	const model = resolveModel(antConfig.model, registry);
	if (!model) {
		const identity = modelIdentity(antConfig.model);
		throw new Error(
			`Model not found: ${antConfig.model} (provider: ${identity.provider}, model: ${identity.model}). ` +
				"Ensure the model is configured in your provider settings or pass a valid model override.",
		);
	}
	const configuredIdentity = modelIdentity(antConfig.model);

	const tools = createToolsForCaste(cwd, antConfig.tools);
	const resourceLoader = makeMinimalResourceLoader(systemPrompt);

	const settingsManager = SettingsManager.inMemory({
		compaction: { enabled: false },
		retry: { enabled: true, maxRetries: 1 },
	});

	let accumulatedText = "";
	let rateLimited = false;
	// Biome-ignore lint/suspicious/noExplicitAny: AgentSession type is not exported from the SDK
	let session: AgentSession | null = null;

	try {
		const created = await createAgentSession({
			authStorage: auth,
			cwd,
			model,
			modelRegistry: registry,
			resourceLoader,
			sessionManager: SessionManager.inMemory(),
			settingsManager,
			thinkingLevel: "off",
			tools,
		});
		({ session } = created);

		// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Ant stream handling needs streaming, usage, and pheromone updates in one subscription.
		session.subscribe((event: AgentSessionEvent) => {
			if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
				const { delta } = event.assistantMessageEvent;
				accumulatedText += delta;
				onStream?.({
					antId,
					caste: antConfig.caste,
					delta,
					taskId: task.id,
					totalText: accumulatedText,
				});
			}

			if (event.type === "turn_end") {
				ant.usage.turns++;
				if (antConfig.caste === "scout" && accumulatedText) {
					const livePheromones = extractPheromones(antId, antConfig.caste, task.id, accumulatedText, task.files);
					for (const p of livePheromones) {
						p.id = makePheromoneId();
						nest.dropPheromone(p);
					}
				}
			}

			if (event.type === "message_end" && event.message?.role === "assistant") {
				const message = event.message as {
					usage?: {
						input?: number;
						output?: number;
						cacheRead?: number;
						cacheWrite?: number;
						cost?: { total?: number };
					};
					provider?: string;
					model?: string;
				};
				const { usage } = message;
				if (usage) {
					const input = toNumber(usage.input);
					const output = toNumber(usage.output);
					const cacheRead = toNumber(usage.cacheRead);
					const cacheWrite = toNumber(usage.cacheWrite);
					const costTotal = toNumber(usage.cost?.total);

					ant.usage.input += input;
					ant.usage.output += output;
					ant.usage.cost += costTotal;

					onUsage?.({
						antId,
						caste: antConfig.caste,
						model: typeof message.model === "string" ? message.model : configuredIdentity.model,
						provider: typeof message.provider === "string" ? message.provider : configuredIdentity.provider,
						taskId: task.id,
						usage: {
							cacheRead,
							cacheWrite,
							costTotal,
							input,
							output,
						},
					});
				}
			}
		});

		const userPrompt = `Execute this task: ${task.title}\n\n${task.description}`;

		let onAbort: (() => void) | undefined;
		if (signal) {
			onAbort = () => session.abort();
			if (signal.aborted) {
				await session.abort();
			} else {
				signal.addEventListener("abort", onAbort, { once: true });
			}
		}

		try {
			await session.prompt(userPrompt);
		} finally {
			if (signal && onAbort) {
				signal.removeEventListener("abort", onAbort);
			}
		}

		const { messages } = session;
		let finalOutput = accumulatedText;
		if (!finalOutput) {
			for (let i = messages.length - 1; i >= 0; i--) {
				const msg = messages[i];
				if (msg.role === "assistant") {
					for (const part of msg.content) {
						const typed = part as { type: string; text?: string };
						if (typed.type === "text") {
							finalOutput = typed.text ?? "";
							break;
						}
					}
					if (finalOutput) {
						break;
					}
				}
			}
		}

		ant.status = "done";
		ant.finishedAt = Date.now();
		nest.updateAnt(ant);

		const newTasks = parseSubTasks(finalOutput);
		const pheromones = extractPheromones(antId, antConfig.caste, task.id, finalOutput, task.files);
		for (const p of pheromones) {
			nest.dropPheromone(p);
		}

		nest.updateTaskStatus(task.id, "done", finalOutput);

		return {
			ant,
			newTasks,
			output: finalOutput,
			pheromones,
			rateLimited: false,
		};
	} catch (error: unknown) {
		const errStr = String(error);
		rateLimited = errStr.includes("429") || errStr.includes("rate limit") || errStr.includes("Rate limit");

		if (rateLimited) {
			nest.updateTaskStatus(task.id, "pending");
			ant.status = "failed";
			ant.finishedAt = Date.now();
			nest.updateAnt(ant);
			return {
				ant,
				output: accumulatedText,
				newTasks: [],
				pheromones: [],
				rateLimited: true,
			};
		}

		ant.status = "failed";
		ant.finishedAt = Date.now();
		nest.updateAnt(ant);

		const newTasks = parseSubTasks(accumulatedText);
		const pheromones = extractPheromones(antId, antConfig.caste, task.id, accumulatedText, task.files, true);
		for (const p of pheromones) {
			nest.dropPheromone(p);
		}

		// Preserve full error with stack trace for post-mortem debugging
		const fullError = error instanceof Error ? `${error.message}\n${error.stack || ""}` : errStr;
		const errorWithPartialOutput = accumulatedText
			? `${fullError.slice(0, 1500)}\n\n--- Partial output before failure ---\n${accumulatedText.slice(-500)}`
			: fullError.slice(0, 2000);
		nest.updateTaskStatus(task.id, "failed", accumulatedText, errorWithPartialOutput);

		return {
			ant,
			newTasks,
			output: accumulatedText,
			pheromones,
			rateLimited: false,
		};
	} finally {
		try {
			session?.dispose();
		} catch (error) {
			// Log dispose errors instead of swallowing them silently.
			// These can indicate resource leaks (unclosed streams, handles).
			console.error(`[ant:${antId}] session dispose error: ${String(error).slice(0, 200)}`);
		}
	}
}
