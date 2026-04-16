# Startup Performance Audit

This audit summarizes the current first-load and early-interaction hotspots that affect `pi` when the default oh-pi extension stack is loaded.

## What now runs on every PR

The new TypeScript startup benchmark suite runs on every pull request and push:

- `pnpm bench:startup`
- GitHub Actions job: `Benchmarks (TypeScript)`
- Reports written to `coverage/benchmarks/startup/`
- Markdown summary appended to the workflow step summary
- PR-specific extension selection driven by changed-file analysis

For local debugging, you can isolate extension startup cases with:

```bash
OH_PI_BENCH_EXTENSION_FILTER=worktree pnpm bench:startup
```

The benchmark suite currently covers:

1. full-stack default extension registration + `session_start`
2. near-threshold session-history startup work
3. scheduler persisted-store loading
4. custom-footer large-history usage scans
5. usage-tracker startup hydration
6. lightweight worktree current-context probes
7. full worktree snapshot git probes
8. first footer render cost

## Ranked hotspot summary

### 1. `packages/extensions/extensions/worktree-shared.ts`

**Why it matters**

`getRepoWorktreeSnapshot()` performs several synchronous git subprocess calls with `execFileSync()`:

- `rev-parse --is-inside-work-tree`
- `rev-parse --show-toplevel`
- `rev-parse --git-common-dir`
- `rev-parse --absolute-git-dir`
- `rev-parse --abbrev-ref HEAD`
- `worktree list --porcelain`

That work blocks the Node event loop completely.

**Current benchmark coverage**

- `worktree current context (single temp repo)`
- `worktree snapshot (single temp repo)`

**Latest optimization pass**

The footer and worktree status paths now use a lighter current-context probe instead of the full worktree inventory path. That splits the hot path in two:

- lightweight current-context refresh for footer/status updates
- full snapshot refresh for explicit `/worktree` reports and `/status` overlay details

That change also removed the footer's 30-second timer from re-triggering worktree git probes, which was the strongest match for the reported periodic typing stalls.

**Why it is the top suspect**

This is the most expensive focused startup-adjacent benchmark today and maps directly to the sort of post-startup hitch that feels like typing lag.

### 2. `packages/extensions/extensions/scheduler.ts`

**Why it matters**

`scheduler-registration.ts` wires `session_start` directly into `runtime.setRuntimeContext(ctx)`, and that path can synchronously:

- migrate legacy storage
- read the scheduler store from disk
- read lease state
- reconcile runtime state

**Current benchmark coverage**

- `scheduler persisted store load (50 tasks)`
- included indirectly by the full-stack startup cases

**What to watch**

The scheduler store is capped, so this path is not the largest benchmark today, but it is on the hot startup path and should stay small.

### 3. `packages/extensions/extensions/custom-footer.ts`

**Why it matters**

The footer caches totals after startup, but the aggregation path is still O(n) over assistant messages. It also schedules worktree snapshot refreshes, which means it can trigger the synchronous git path above.

**Current benchmark coverage**

- `custom footer usage scan (50k messages)`
- `custom footer first render (200-entry history)`
- included indirectly by the full-stack startup cases

### 4. `packages/extensions/extensions/usage-tracker.ts`

**Why it matters**

The usage tracker hydrates from session history near startup and also schedules persisted-state loading and provider probing. For histories below the defer threshold it still does immediate session reconstruction.

**Current benchmark coverage**

- `usage tracker session_start (200-entry history)`
- included indirectly by the full-stack startup cases

### 5. `packages/ant-colony/extensions/ant-colony/*`

**Why it matters**

The colony runtime keeps orchestration in-process. The deeper audit found several responsiveness risks outside first-load startup:

- blocking git worktree setup
- synchronous nest/state writes
- busy-wait lock spinning
- blocking `npx tsc --noEmit`

**Benchmark status**

The new PR-gated suite covers the default extension stack at startup, but colony runtime execution still needs a dedicated focused benchmark suite.

### 6. `packages/subagents/*`

**Why it matters**

Subagents mostly offload heavy work to subprocesses, but the main process still pays for:

- startup monitor setup
- result watcher activity
- async status polling

**Benchmark status**

Covered indirectly by the full-stack startup cases. A follow-up focused suite would help quantify watcher/poller overhead under many active jobs.

### 7. `packages/providers/*`

**Why it matters**

The provider catalog/bootstrap path was identified as a startup risk in the deeper audit because environment-configured providers can trigger immediate bootstrap work.

**Benchmark status**

Not part of the default oh-pi extension manifest today, so it is not included in the new PR-gated startup suite.

## Editor-side debug visibility

The watchdog runtime diagnostics can now be used to inspect startup handler timings after a restart:

```text
/watchdog startup
```

That surfaces the latest per-extension `session_start` timings recorded during the active instance so you can compare what the benchmark suite sees with what the editor instance is doing live.

## Interpreting the new benchmark reports

The startup report is budget-based rather than branch-diff-based.

That means each benchmark has committed median and p95 thresholds:

- if a benchmark stays under budget, CI passes
- if a benchmark exceeds budget, CI fails and the report calls out the exact regression

This is intentionally conservative for now. The goal is to make regressions visible on every PR without introducing noisy failures from runner variance.

## Recommended next optimization work

### Highest-priority code change

Refactor `worktree-shared.ts` so startup-visible worktree inspection no longer depends on several back-to-back synchronous git subprocess calls.

Good options to explore next:

1. cache a single snapshot per startup window and share it across footer/worktree consumers
2. move the git probe to an async background refresh path
3. collapse the number of git calls where possible
4. avoid duplicate footer + worktree-triggered refreshes in the same window

### Next tier

1. reduce synchronous scheduler disk touches on `session_start`
2. reduce or eliminate eager `getBranch()` / history reconstruction on startup-sensitive paths
3. add focused benchmark suites for ant-colony runtime responsiveness and subagent monitor load

## Practical takeaway

The benchmark infrastructure is now in place.

The clearest measured next target is still:

- **worktree snapshot startup cost**

That is the best place to look first if the goal is to reduce the event-loop spikes that show up as early typing lag.
