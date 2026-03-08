---
default: minor
---

### `@ifi/oh-pi-ant-colony` — Initial release

Multi-agent swarm extension modeled after real ant ecology.

- **Colony lifecycle**: SCOUTING → PLANNING_RECOVERY → WORKING → REVIEWING → DONE with automatic
  phase transitions
- **Three ant castes**: Scouts (fast/cheap models for exploration), Workers (capable models for code
  changes), Soldiers (thorough models for review)
- **In-process agents**: Each ant is an `AgentSession` via pi SDK — zero startup overhead, shared
  auth and model registry
- **Pheromone communication**: `.ant-colony/pheromone.jsonl` shared discovery log with 10-minute
  half-life decay
- **Adaptive concurrency**: Auto-tunes parallelism based on throughput, CPU load (>85% reduction),
  and 429 rate limit backoff (2s→5s→10s cap)
- **File locking**: One ant per file — conflicting tasks are blocked and resume when locks release
- **Planning recovery**: When scouts return unstructured intel, colony enters `planning_recovery`
  instead of failing
- **Plan validation gate**: Tasks are validated (title/description/caste/priority) before workers
  start
- **Scout quorum**: Multi-step goals default to ≥2 scouts for better planning reliability
- **Real-time UI**: Status bar with task progress, active ants, tool calls, cost; `Ctrl+Shift+A`
  overlay panel; `/colony-stop` abort command
- **Signal protocol**: Structured `COLONY_SIGNAL:*` messages pushed to main conversation (LAUNCHED,
  SCOUTING, WORKING, REVIEWING, COMPLETE, FAILED, BUDGET_EXCEEDED)
- **Turn budgets**: Scout: 8, Worker: 15, Soldier: 8 — prevents runaway execution
- **Auto-trigger**: LLM deploys colony when ≥3 files need changes or parallel workstreams are
  possible
