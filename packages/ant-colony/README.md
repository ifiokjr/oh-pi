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
/colony-stop                Cancel a running colony
Ctrl+Shift+A                Open colony details panel
```

### Examples

```
/colony Migrate the entire project from CommonJS to ESM, updating all imports/exports and tsconfig

/colony Add unit tests for all modules under src/, targeting 80% coverage

/colony Refactor auth system from session-based to JWT, maintaining API compatibility
```

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
# Option 1: Symlink to pi extensions directory
mkdir -p ~/.pi/agent/extensions/ant-colony
ln -sf "$(pwd)/pi-package/extensions/ant-colony/index.ts" ~/.pi/agent/extensions/ant-colony/index.ts
# ... (symlink all .ts files)

# Option 2: Install via oh-pi
npx oh-pi  # Select "Full Power" preset
```

## Module Reference

| File             | Lines | Responsibility                                                             |
| ---------------- | ----- | -------------------------------------------------------------------------- |
| `types.ts`       | ~150  | Type system: ants, tasks, pheromones, colony state                         |
| `nest.ts`        | ~500  | Nest: file-system shared state, atomic R/W, pheromone decay                |
| `concurrency.ts` | ~120  | Adaptive concurrency: system sampling, exploration/steady-state adjustment |
| `spawner.ts`     | ~370  | Ant spawning: session management, prompt construction, output parsing      |
| `queen.ts`       | ~1000 | Queen scheduling: lifecycle, task waves, multi-round iteration             |
| `index.ts`       | ~900  | Extension entry: tool/shortcut registration, TUI rendering                 |
| `deps.ts`        | ~140  | Lightweight import graph for dependency-aware scheduling                   |
| `parser.ts`      | ~180  | Sub-task and pheromone extraction from ant output                          |
| `prompts.ts`     | ~90   | Per-caste system prompts and prompt builder                                |
| `ui.ts`          | ~140  | Formatting helpers for status bar, overlay, and reports                    |
