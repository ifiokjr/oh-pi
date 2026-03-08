# Benchmarks (Scaffold)

This directory provides a **unified template** for benchmarking comparisons between:

- Single agent
- Multi-agent colony (ant colony)

> Current phase provides documentation scaffolding only — no implementation scripts.

## Goals

Comparative evaluation across these dimensions:

1. Success Rate
2. Duration
3. Cost
4. Rollback Rate

Stratified by task complexity:

- S (Small)
- M (Medium)
- L (Large)

## Files

- `scenarios.md`: Scenario list template (by S/M/L tier)
- `results-template.md`: Results recording template (single agent vs colony)

## Suggested Execution Flow (Manual)

1. Pick a scenario from `scenarios.md` (with complexity level).
2. Run the same scenario with both:
   - Single agent
   - Ant colony
3. Record each run's results in `results-template.md`.
4. Aggregate the four metrics per complexity level.

## Recording Constraints

- Keep inputs and acceptance criteria consistent for the same scenario.
- Cost measurement must be consistent (e.g. both estimated by tokens / API spend).
- Rollback rate needs clear definition (e.g. "proportion of runs requiring manual revert or redo").

## Future Extensions

- Add automated data collection scripts.
- Add visualization reports.
- Integrate results into CI periodic regression.
