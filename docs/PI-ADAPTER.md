# PiAdapter Interface Draft (Phase C)

> Goal: Introduce an anti-corruption layer between `spawner.ts` and the pi SDK — unifying session creation, tool injection, streaming callbacks, and interrupt/timeout handling to isolate SDK change impact.

## 1. Design Goals

- **Boundary convergence**: Centralize scattered SDK calls into `PiAdapter`; business logic should not depend on low-level API details.
- **Upgrade isolation**: When the SDK upgrades, absorb differences in the adapter layer first; don't propagate changes to scheduling and task orchestration.
- **Behavior preservation**: Only constrain call boundaries; don't change queen/spawner business semantics or task flow.
- **Testability**: Interface injection enables mock/fake for repeatable testing of timeouts, cancellation, and streaming events.

## 2. Interface Draft (TypeScript)

```ts
export type PiRole = "system" | "user" | "assistant";

export interface PiMessage {
	role: PiRole;
	content: string;
}

export interface PiToolSpec {
	name: string;
	description?: string;
	inputSchema?: unknown;
}

export interface CreateSessionOptions {
	model?: string;
	instructions?: string;
	metadata?: Record<string, string>;
	timeoutMs?: number;
}

export interface RunOptions {
	tools?: PiToolSpec[];
	timeoutMs?: number;
	signal?: AbortSignal;
	onToken?: (token: string) => void;
	onEvent?: (event: { type: string; data?: unknown }) => void;
}

export interface PiRunResult {
	outputText: string;
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		costUsd?: number;
	};
	raw?: unknown;
}

export interface PiSession {
	id: string;
	run(messages: PiMessage[], options?: RunOptions): Promise<PiRunResult>;
	interrupt(reason?: string): Promise<void>;
	close(): Promise<void>;
}

export interface PiAdapter {
	createSession(options?: CreateSessionOptions): Promise<PiSession>;
}
```

### 2.1 Capability Mapping

- **Session creation**: `createSession` wraps model, initial instructions, metadata, and default timeout.
- **Tool injection**: `RunOptions.tools` is the single entry point; business logic doesn't splice SDK-specific fields.
- **Streaming callbacks**: `onToken`/`onEvent` expose a stable event model to upper layers.
- **Interrupt/timeout**: `AbortSignal` + `timeoutMs` + `interrupt()` unify cancellation semantics.

## 3. Migration Steps (Docs First, Then Code)

### Step 1: Interface Landing (no behavior change)

- Add `PiAdapter` type definitions and default implementation placeholder.
- `spawner.ts` maintains current logic; only prepare dependency injection points.

### Step 2: Call Consolidation (minimal changes)

- Migrate session creation, invocation, and streaming in `spawner.ts` to `PiAdapter`.
- Keep input/output structures unchanged; ensure existing flow regression passes.

### Step 3: Timeout/Interrupt Unification

- Consolidate scattered timeout and cancellation handling into the adapter layer.
- Add exception classification (timeout, user cancel, SDK error) while keeping upper-layer error semantics stable.

### Step 4: Upgrade Rehearsal & Rollback

- Rehearse an SDK upgrade without changing scheduling logic.
- If issues arise, allow temporary fallback to old call path (short-term toggle), then iterate the adapter.

## 4. Non-Goals (Current Phase)

- No rewriting queen/spawner scheduling strategy.
- No new business state machines or task assignment rules.
- No benchmark or evaluation criteria changes in this phase.
