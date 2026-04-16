---
default: patch
---

Reduce ant-colony runtime churn by deduplicating repeated colony status-bar updates, replacing lock spin-waiting with sleeping lock retries, and skipping pre-review TypeScript checks unless worker output actually touched a detectable TS project.
