# PheromoneStore Interface Draft (Phase B)

> Goal: Extract pheromone read/write from `nest.ts` JSONL implementation details. Define a stable interface first, then implement swappable Jsonl/SQLite storage.

## 1. Design Goals

- **Swappable**: Default JSONL; can switch implementations without changing queen scheduling logic.
- **Observable**: Expose storage size, active entries after decay, write failure stats, etc.
- **Configurable**: Support global and per-caste (scout/worker/soldier) decay policies.
- **Incremental migration**: Adapt existing behavior first, then introduce SQLite/Redis later.

## 2. Non-Goals (Current Phase)

- No distributed consistency guarantees.
- No cross-machine shared locks.
- No changes to existing task scheduling or priority algorithms.

## 3. Proposed Interface (TypeScript)

```ts
export interface DecayPolicy {
  // Default half-life in milliseconds (e.g. 10 * 60 * 1000)
  defaultHalfLifeMs: number;
  // Optional: per-caste override
  perCasteHalfLifeMs?: Partial<Record<"scout" | "worker" | "soldier" | "drone", number>>;
  // Strength threshold — entries below this are considered expired
  minStrength?: number; // default: 0.05
}

export interface PheromoneQuery {
  files?: string[];
  types?: Array<"discovery" | "progress" | "warning" | "completion" | "dependency" | "repellent">;
  limit?: number;
  includeDecayed?: boolean;
}

export interface PheromoneStoreStats {
  totalStored: number;
  totalActive: number;
  lastCompactionAt: number | null;
  storageBytes: number;
}

export interface PheromoneStore {
  append(entry: import("./types.js").Pheromone): Promise<void>;
  query(q?: PheromoneQuery): Promise<import("./types.js").Pheromone[]>;
  compact(now?: number): Promise<void>;
  setDecayPolicy(policy: DecayPolicy): Promise<void>;
  getStats(): Promise<PheromoneStoreStats>;
  close(): Promise<void>;
}
```

## 4. Mapping to Existing Nest Behavior

Current pheromone responsibilities in `nest.ts`:
- `dropPheromone`: Append-write to JSONL
- `getAllPheromones`: Incremental read + decay + filter + periodic GC
- `countWarnings/getPheromoneContext`: Query views

Migration strategy:
1. Keep `Nest` public methods unchanged.
2. Push JSONL details down into `JsonlPheromoneStore`.
3. `Nest` depends only on the `PheromoneStore` interface.

## 5. Migration Steps (Recommended)

### Step 1: Interface Introduction (no behavior change)
- Create `pi-package/extensions/ant-colony/pheromone-store.ts` (types + factory only).
- Existing logic stays in `nest.ts` but calls through the adapter layer.

### Step 2: JSONL Default Implementation
- Extract existing JSONL read/write logic from `nest.ts` into `jsonl-pheromone-store.ts`.
- Keep existing half-life and threshold defaults; ensure regression tests pass.

### Step 3: SQLite Experimental Implementation
- Add `sqlite-pheromone-store.ts` (behind feature flag).
- Compare for the same task set: read latency, file size, GC duration.

## 6. Acceptance Criteria (Phase B)

- Swapping storage implementation doesn't affect queen scheduling results.
- `planning_recovery` flow behavior is identical in regression tests.
- No data corruption or significant performance degradation under long sessions (high-frequency writes).

## 7. Risks & Rollback

- Risk: Incomplete interface abstraction causes `Nest` to leak implementation details.
- Rollback: Keep JSONL legacy path switch (`PHEROMONE_STORE=jsonl-legacy`) during a transition period.
