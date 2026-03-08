# Ant Colony Restart Fault Tolerance

## Key Directories

Restart fault tolerance depends on the following directories and files:

- Runtime persistence directory: `.ant-colony/{colony-id}/`
  - `state.json`: Records phase state, current goal, concurrency history, etc.
  - `tasks/*.json`: Records task definitions, status, and results.
- Documentation: `pi-package/extensions/ant-colony/README.md` describes the nest structure (`state.json / pheromone.jsonl / tasks/*.json`).
- Persistence directory is gitignored: `index.ts` ensures `.ant-colony/` is added to `.gitignore` at startup, preventing runtime files from polluting the repository.

Runtime sample observations (real data):

- `state.json` shows current goal and `planning_recovery` state.
- `state.json` concurrency history samples prove runtime metrics are continuously persisted.
- `tasks/*.json` shows task content and results are persisted.

## Recovery Mechanisms

### 1) Listener Recovery After Session Restart

- `index.ts`: On `session_start`, removes old listeners and re-binds, directly addressing stale `ctx` after `/reload`, preventing event chain breakage.

### 2) Concurrency Fault Tolerance & 429 Recovery

- `concurrency.ts`: When no pending tasks, concurrency drops to minimum, preventing idle amplification of risk.
- `concurrency.ts`: After a 429, enters a 30-second cooldown window before increasing concurrency.
- `concurrency.ts`: After cooldown, executes "429 recovery" — concurrency restores to `optimal`.

### 3) Recoverable State After Task Conflicts

- Conflicting tasks enter `blocked` state; they resume when file locks are released — a recoverable design for error paths.

### 4) Task Parser Input Constraints (Preventing no_pending_worker_tasks)

- `parser.test.ts`: Chinese TASK structures (with full-width colons) are correctly parsed.
- `parser.test.ts`: Plain narrative text ("next steps" without structure) does not generate tasks — recovery must output structured TASK blocks.

## Conclusion

Based on code, README, and `.ant-colony` runtime samples, the extension has a complete restart fault-tolerance loop:

1. **State is persisted**: `state.json + tasks/*.json` persist critical execution state and task results.
2. **Restart is resumable**: `session_start` re-binds listeners, fixing stale context after `/reload`.
3. **Failures stabilize**: Concurrency control has load-shedding, cooldown, and recovery-to-optimal strategies for idle and 429 scenarios.
4. **Scheduling continues**: As long as structured TASK output is maintained, the scheduler reliably identifies and advances worker tasks.

This document is informational only — no source files were modified.
