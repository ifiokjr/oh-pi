---
default: minor
---

Add concrete multimodal/telemetry routing capabilities and completion verification coverage:

- add worker-class routing (`design`, `multimodal`, `backend`, `review`) with per-class model override support
- add cheap-first multimodal ingestion preprocessing and route metadata handling for worker tasks
- add promote/finalize gate types + decision logic with confidence/coverage/risk/policy/SLO reasons
- record routing telemetry (claimed/completed/failed/escalated, latency, reasons) and roll it into budget summary snapshots
- expose new ant-colony tool model override parameters for worker classes
- add focused tests for gate decisions, budget telemetry rollups, and index-level event-bus propagation
- add deterministic completion verification harness (`pnpm verify:completion`) with slash-command completion tests
