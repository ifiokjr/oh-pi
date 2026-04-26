# Cost Optimization for Multimodal (Image/Video) Workloads

## Objective

Increase speed and reduce spend by making cheap multimodal extraction/summarization the default and reserving premium models/workers for ambiguous or high-risk cases.

## Cost/Speed Strategy

1. **Tiered Inference**
   - Tier 1 (default): low-cost multimodal model for extraction + summary.
   - Tier 2 (conditional): premium multimodal/text model for deep reasoning or high-stakes validation.
2. **Compute Shaping**
   - Videos: sample scenes/keyframes first instead of full-frame dense analysis.
   - Run OCR/ASR once and reuse outputs across retries.
3. **Escalation Discipline**
   - Escalate only on threshold failure or policy requirement.
4. **Prompt Compression**
   - Structured prompts + strict schemas reduce verbose output tokens.
5. **Result Reuse**
   - Cache by asset hash + intent to prevent duplicate runs.

## Routing Matrix

| Asset Type      | Default Cheap Model Class | Preprocess Step                            | Finalize Condition                              | Escalate Condition                             |
| --------------- | ------------------------- | ------------------------------------------ | ----------------------------------------------- | ---------------------------------------------- |
| Image           | image-lite MM             | normalize + optional OCR                   | confidence >= 0.78 and no risk flags            | low confidence, missing fields, risk flags     |
| Video (<5 min)  | video-lite MM             | keyframes + ASR                            | coverage >= 0.85 and no high-stakes intent      | uncertainty, timeline gaps, high-stakes intent |
| Video (>=5 min) | video-lite MM             | scene segmentation + sparse sampling + ASR | key events extracted with acceptable confidence | unresolved critical segments                   |
| Mixed media     | multimodal-lite MM        | modality split + merge                     | complete schema and no blocked policy           | cross-modal contradiction or low confidence    |

## Budget Guardrails

- Define per-task `max_estimated_cost_usd` at intake.
- If cheap-pass projected cost exceeds budget:
  - reduce sampling density,
  - tighten extraction scope,
  - request user approval before premium escalation.

## Latency Guardrails

- Set SLO bands by task type (e.g., quick summary vs forensic review).
- If Tier 1 breaches SLO repeatedly, switch to backup cheap model before premium.

## Quality Guardrails

- Minimum thresholds:
  - `confidence_score >= 0.78`
  - `coverage_score >= 0.85`
- Hard escalation for flagged domains:
  - legal/compliance,
  - medical/safety,
  - financial risk,
  - security incidents.

## KPIs to Track

- Cheap-pass completion rate (% finalized without escalation).
- Average cost per task by modality.
- P50/P95 latency by modality.
- Escalation rate and escalation causes.
- Rework rate after finalize (quality escape metric).

## Implementation Checklist

- [ ] Enforce `cheap-first` routing in orchestrator.
- [ ] Standardize `summary_schema` across models.
- [ ] Implement threshold-based promote/finalize gate.
- [ ] Add asset-hash cache for OCR/ASR/keyframes.
- [ ] Log cost/latency/quality telemetry for each run.
- [ ] Add policy bypass path for mandatory premium review tasks.

## Example Promote/Finalize Logic

```text
if risk_flags contains high_stakes_domain:
  promote
else if confidence_score < 0.78:
  promote
else if coverage_score < 0.85:
  promote
else:
  finalize
```

## Colony Handoff Notes

- Downstream higher-tier workers should consume `summary_schema` first and only inspect raw media for unresolved points.
- Keep escalation reasons machine-readable for later routing-policy tuning.
