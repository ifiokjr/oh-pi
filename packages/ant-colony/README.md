# 🐜 Ant Colony — Multi-Agent Swarm Extension

> A self-organizing multi-agent system modeled after real ant colony ecology. Adaptive concurrency,
> pheromone communication, zero centralized scheduling.

## Architecture

```
Queen                           Main pi process, receives goals, orchestrates lifecycle
  │
  ├─ 🔍 Scout                   Lightweight haiku, explores paths, marks food sources
  ├─ ⚒️  Worker                  Sonnet, executes tasks, may spawn sub-tasks
  └─ 🛡️ Soldier                 Sonnet, reviews quality, may request rework

Pheromone                       .ant-colony/ file system, indirect ant-to-ant communication
Nest                            Shared state, atomic file operations, cross-process safe
```

## Lifecycle

```
Goal → Scouting → Task Pool → Workers Execute in Parallel → Soldiers Review → Fix (if needed) → Done
          │                           │
          │  Pheromone decay (10min)   │  Sub-tasks auto-spawned
          └───────────────────────────┘
```

## Workspace Isolation (Default)

By default, each colony runs in an **isolated git worktree** on its own branch (`ant-colony/...`).
This keeps your current branch untouched while the swarm edits code.

If worktree creation is unavailable (e.g. not a git repo), the colony automatically falls back to the shared cwd and
reports the reason in the final report/status output.

You can disable worktree isolation with:

```bash
PI_ANT_COLONY_WORKTREE=0
```

## Adaptive Concurrency

Models real ant colony dynamic recruitment:

- **Cold start**: 1–2 ants, gradual exploration
- **Exploration phase**: +1 each wave, monitoring throughput inflection point
- **Steady state**: fine-tune around optimal value
- **Overload protection**: CPU > 85% or memory < 500MB → auto-reduce
- **Elastic scaling**: more tasks → recruit; fewer tasks → shrink

## Usage

### Auto-Trigger

The LLM automatically invokes the `ant_colony` tool when task complexity warrants it.

### Commands

```
/colony <goal>              Start a new colony for the given goal
/colony-count               Show number of currently running colonies
/colony-status [id]         Show running colonies (runtime cN or stable colony-... ID)
/colony-stop [id|all]       Cancel one running colony (runtime/stable ID) or all
/colony-resume [colonyId]   Resume a specific stable colony ID, or all resumable by default
Ctrl+Shift+A                Open colony details panel
```

### Examples

```
/colony Migrate the entire project from CommonJS to ESM, updating all imports/exports and tsconfig

/colony Add unit tests for all modules under src/, targeting 80% coverage

/colony Refactor auth system from session-based to JWT, maintaining API compatibility
```

## Usage Tracking Integration

Ant inference usage (tokens + cost) is streamed to the `usage-tracker` extension via `pi.events` (`usage:record`).
So `/usage`, `usage_report`, and session cost totals now include background colony inference, making colony spend visible.

## Pheromone System

Ants communicate indirectly through pheromones (stigmergy), not direct messages:

| Type       | Released By | Meaning                                 |
| ---------- | ----------- | --------------------------------------- |
| discovery  | Scout       | Discovered code structure, dependencies |
| progress   | Worker      | Completed changes, file modifications   |
| warning    | Soldier     | Quality issues, conflict risks          |
| completion | Worker      | Task completion marker                  |
| dependency | Any         | File dependency relationships           |

Pheromones decay exponentially (10-minute half-life), preventing stale info from misleading
subsequent ants.

## File Locking

Each task declares the files it operates on. The queen guarantees:

- Only one ant modifies a given file at any time
- Conflicting tasks are automatically marked `blocked` and resume when locks release

## Nest Structure

```
.ant-colony/{colony-id}/
├── state.json           Colony state
├── pheromone.jsonl       Append-only pheromone log
└── tasks/               One file per task (atomic updates)
    ├── t-xxx.json
    └── t-yyy.json
```

## Installation

```bash
# Install just ant-colony
pi install npm:@ifi/oh-pi-ant-colony

# Or install the full oh-pi bundle (includes ant-colony)
pi install npm:@ifi/oh-pi
```

Then enable/configure extensions with:

```bash
npx @ifi/oh-pi-cli
```

## Module Reference

| File             | Lines | Responsibility                                                             |
| ---------------- | ----- | -------------------------------------------------------------------------- |
| `types.ts`       | ~150  | Type system: ants, tasks, pheromones, colony state                         |
| `nest.ts`        | ~500  | Nest: file-system shared state, atomic R/W, pheromone decay                |
| `concurrency.ts` | ~120  | Adaptive concurrency: system sampling, exploration/steady-state adjustment |
| `spawner.ts`     | ~420  | Ant spawning: session lifecycle, usage streaming, prompt/output handling   |
| `queen.ts`       | ~1020 | Queen scheduling: lifecycle, task waves, multi-round iteration             |
| `worktree.ts`    | ~180  | Git worktree isolation and resume workspace recovery helpers               |
| `index.ts`       | ~1050 | Extension entry: tool/shortcut registration, TUI rendering, status signals |
| `deps.ts`        | ~140  | Lightweight import graph for dependency-aware scheduling                   |
| `parser.ts`      | ~180  | Sub-task and pheromone extraction from ant output                          |
| `prompts.ts`     | ~90   | Per-caste system prompts and prompt builder                                |
| `ui.ts`          | ~140  | Formatting helpers for status bar, overlay, and reports                    |
