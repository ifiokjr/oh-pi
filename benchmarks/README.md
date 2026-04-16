# Benchmarks

This directory contains the repo's TypeScript benchmark suites.

## Benchmark suites

- `startup/startup-bench.test.ts` — PR-gated startup and hotspot regressions for the default oh-pi extension stack
- `extensions-render-performance.ts` — session-length-sensitive footer/render microbench
- `live-runtime-behavior.ts` — always-on widget and overlay rendering microbench

## Run benchmarks locally

```bash
pnpm bench:startup
pnpm bench:extensions-render
pnpm bench:live-runtime
pnpm bench
```

To benchmark only one or a few extensions in isolation:

```bash
OH_PI_BENCH_EXTENSION_FILTER=worktree pnpm bench:startup
OH_PI_BENCH_EXTENSION_FILTER=watchdog,custom-footer pnpm bench:startup
```

The startup suite always keeps the baseline startup/hotspot cases, then adds isolated extension startup cases for the selected extensions.

## CI behavior

`pnpm bench:startup` runs on every pull request and push in GitHub Actions.

For pull requests, the workflow computes impacted extensions from the changed files and sets `OH_PI_BENCH_EXTENSION_FILTER` automatically. If shared infrastructure changes, it benchmarks all default extensions.

It writes machine-readable and Markdown reports to:

```text
coverage/benchmarks/startup/
```

The CI job uploads those reports as artifacts and appends the Markdown summary to the GitHub step summary.

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

## Existing manual scenario templates

The scenario templates below are still available for broader product evaluations:

- `scenarios.md`
- `results-template.md`
