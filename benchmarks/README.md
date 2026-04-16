# Benchmarks

This directory contains the repo's TypeScript benchmark suites.

## Benchmark suites

- `startup/startup-bench.test.ts` — PR-gated startup and hotspot regressions for the default oh-pi extension stack
- `runtime/runtime-bench.test.ts` — PR-gated mounted-idle UI churn report for the default stack plus isolated extensions one by one
- `extensions-render-performance.ts` — session-length-sensitive footer/render microbench
- `live-runtime-behavior.ts` — always-on widget and overlay rendering microbench

## Run benchmarks locally

```bash
pnpm bench:startup
pnpm bench:runtime
pnpm bench:extensions-render
pnpm bench:live-runtime
pnpm bench
```

To benchmark only one or a few extensions in isolation:

```bash
OH_PI_BENCH_EXTENSION_FILTER=worktree pnpm bench:startup
OH_PI_BENCH_EXTENSION_FILTER=watchdog,custom-footer pnpm bench:startup
OH_PI_BENCH_EXTENSION_FILTER=diagnostics pnpm bench:runtime
OH_PI_BENCH_EXTENSION_FILTER=subagents,diagnostics pnpm bench:runtime
```

To run only specific focused startup hotspots alongside the always-on startup baselines:

```bash
OH_PI_BENCH_FOCUSED_FILTER=worktree-context-temp-repo,worktree-snapshot-temp-repo pnpm bench:startup
```

The startup suite always keeps the baseline startup cases, adds only the selected focused hotspots when a focused filter is present, and then adds isolated extension startup cases for the selected extensions.

## CI behavior

`pnpm bench:startup` and `pnpm bench:runtime` run on every pull request and push in GitHub Actions.

For pull requests, the workflow computes impacted extensions and focused startup hotspots from the changed files and sets `OH_PI_BENCH_EXTENSION_FILTER` plus `OH_PI_BENCH_FOCUSED_FILTER` automatically. If shared infrastructure changes, it benchmarks all default extensions and all focused hotspots.

It writes machine-readable and Markdown reports to:

```text
coverage/benchmarks/startup/
coverage/benchmarks/runtime/
```

The CI job uploads those reports as artifacts and appends the Markdown summaries to the GitHub step summary.

## What the startup suite measures

The startup suite focuses on the first-load experience instead of task success/cost metrics.

Current cases cover:

1. full-stack extension registration + `session_start`
2. near-threshold session-history startup work
3. scheduler persisted-task loading
4. custom-footer large-history usage scans
5. usage-tracker startup hydration
6. worktree snapshot git probes
7. first footer render cost

Each benchmark has committed median/p95 budgets so regressions fail in CI while still emitting a readable report.

Fast benchmarks can also use a per-sample time floor so each reported sample averages multiple inner runs. That reduces timer noise and makes CI results more stable.

## What the runtime suite measures

The runtime suite mounts widgets and footers, advances a fake 65-second idle window, and reports how much always-on UI churn each extension produces.

Current cases cover:

1. full-stack mounted idle UI churn
2. four-instance mounted idle UI churn scaling
3. isolated extension mounted idle UI churn for each selected extension

This is intended to catch issues that may not show up in startup wall-clock numbers but can still trigger watchdog `event-loop max ...` warnings later because an extension redraws too often or keeps unnecessary timers alive.

## Existing manual scenario templates

The scenario templates below are still available for broader product evaluations:

- `scenarios.md`
- `results-template.md`
