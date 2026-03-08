# DECISIONS

> Lightweight decision log for product direction and architecture trade-offs.

## D-001: Re-center product identity (oh-pi first, ant-colony optional)

- **Date:** 2026-02-24
- **Status:** Accepted

### Context

- ant-colony complexity and code size are growing quickly.
- New users mostly arrive for "one-command setup", not multi-agent orchestration.
- Current risk is positioning drift: users may confuse installer value with advanced swarm value.

### Decision

1. Keep **oh-pi** as the primary product identity: setup, onboarding, and immediate usability.
2. Treat **ant-colony** as an optional advanced extension for complex tasks.
3. Reorder docs to communicate in this sequence:
   - 30-second setup success
   - 2-minute value demonstration
   - clear "when not to use colony" boundaries

### Consequences

- Better first-run clarity and lower cognitive load for new users.
- Advanced users still keep colony power, but through explicit opt-in mental model.
- Short-term downside: some deep architecture content becomes less prominent on the first screen.

### Follow-ups

- Add benchmark evidence (single-agent vs colony) before expanding swarm messaging.
- Add explicit anti-corruption layer plan for pi SDK coupling in `spawner` path.
- Revisit this decision after early growth metrics (activation + retention) are stable.

---

## D-002: Growth focus on one language community first

- **Date:** 2026-02-24
- **Status:** Accepted

### Context

- Documentation is already multi-language, but community traction is still early.
- Spreading effort across many channels too soon risks shallow outcomes.

### Decision

- Prioritize one core developer community first (currently Chinese developer channels), while
  keeping multilingual docs available.

### Consequences

- Better signal concentration and tighter feedback loop.
- Non-priority language communities may get slower narrative updates initially.

---

## D-003: Introduce storage and SDK boundary abstractions before deeper optimization

- **Date:** 2026-02-24
- **Status:** Accepted

### Context

- Pheromone persistence currently relies on local JSONL behavior tightly coupled in `nest` flow.
- `spawner` directly depends on multiple pi SDK APIs, increasing upstream change risk.
- Further optimization without boundaries would amplify maintenance cost.

### Decision

1. Define a `PheromoneStore` interface first, keep JSONL as default implementation.
2. Make decay policy configurable (global + per-caste overrides).
3. Introduce a `PiAdapter` anti-corruption layer before major colony feature expansion.

### Consequences

- Near-term refactor overhead increases, but change risk is localized long-term.
- Future SQLite/Redis experiments become feasible without queen-level rewrites.
- SDK upgrades should mostly be absorbed in adapter layer, not core scheduling logic.
