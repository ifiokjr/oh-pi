# Benchmark Results Template

> Records "single agent vs colony" comparison results for the same scenario.

## Run Header

- Date:
- Executor:
- Mode: Single agent / Colony
- Scenario ID:
- Complexity level: S / M / L
- Run count:

---

## Metric Definitions (keep measurement consistent)

- **Success Rate**: Proportion of runs that met acceptance criteria.
- **Duration**: Total elapsed time from task start to completion (or failure).
- **Cost**: Resource consumption for this run (e.g. tokens or API spend).
- **Rollback Rate**: Proportion of runs requiring manual revert/redo.

---

## Comparison Results Table (copy and fill)

| Scenario ID | Level | Mode         | Success Rate | Avg Duration | Avg Cost | Rollback Rate | Notes |
| ----------- | ----- | ------------ | -----------: | -----------: | -------: | ------------: | ----- |
| S-01        | S     | Single agent |              |              |          |               |       |
| S-01        | S     | Colony       |              |              |          |               |       |
| M-01        | M     | Single agent |              |              |          |               |       |
| M-01        | M     | Colony       |              |              |          |               |       |
| L-01        | L     | Single agent |              |              |          |               |       |
| L-01        | L     | Colony       |              |              |          |               |       |

---

## Conclusion Summary (Template)

- Scenarios covered this round:
- Key observations:
- Single agent advantages:
- Colony advantages:
- Anomalies and failure samples:
- Improvement suggestions for next round:

## Notes

- Record at least 3 repeated runs before comparing averages.
- If a scenario is modified mid-run, annotate separately to avoid polluting comparison results.
