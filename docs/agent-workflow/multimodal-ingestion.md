# Multimodal Asset Ingestion (Low-Cost First)

## Goal

Route image/video tasks through cheaper multimodal models first for extraction and summarization, then escalate to higher-tier workers/models only when confidence, risk, or complexity thresholds require it.

## Scope

- Inputs: image assets, short/long videos, mixed media bundles.
- Outputs: structured summary objects consumable by downstream workers.
- Non-goal: replacing expert review for legal/safety critical decisions.

## Pipeline Overview

1. **Intake & Classification**
   - Detect `asset_type` (`image`, `video`, `mixed`).
   - Detect `task_intent` (`describe`, `extract_text`, `qa`, `design_feedback`, `compliance_check`, `incident_review`, etc.).
   - Detect `constraints` (latency target, budget target, language, privacy level).
2. **Preprocessing**
   - Image normalization (resize, orientation fix, light denoise).
   - Video segmentation (keyframes + scene sampling + optional ASR transcript).
   - Metadata collection (duration, resolution, source, timestamp).
3. **Cheap Multimodal Pass (Primary Route)**
   - Send prepared assets to low-cost multimodal model for:
     - visual summary,
     - OCR/transcript extraction,
     - object/entity/event tagging,
     - confidence + uncertainty notes.
4. **Structured Summary Generation**
   - Normalize output into `summary_schema` (below).
   - Validate required fields.
5. **Decision Gate: Promote or Finalize**
   - If thresholds pass: finalize and return to requester/worker.
   - If thresholds fail or risk flags present: promote to higher-tier worker/model with cheap-pass context attached.
6. **Audit & Feedback Loop**
   - Store route decision, cost, latency, and quality outcomes.
   - Use observed outcomes to tune thresholds and routing rules.

## Decision Tree

```text
asset_type?
├─ image
│  ├─ cheap_mm_model(image-lite)
│  ├─ generate summary_schema
│  └─ promote_or_finalize based on confidence/risk/complexity
├─ video
│  ├─ preprocess (keyframes + transcript)
│  ├─ cheap_mm_model(video-lite)
│  ├─ generate summary_schema
│  └─ promote_or_finalize based on confidence/risk/complexity
└─ mixed
   ├─ split by modality
   ├─ cheap_mm_model(multimodal-lite)
   ├─ merge into unified summary_schema
   └─ promote_or_finalize based on confidence/risk/complexity
```

## Cheap-First Routing Rules

- Default route for all image/video tasks: **cheap multimodal tier**.
- Promote only if one or more conditions are true:
  - `confidence_score < 0.78`
  - `coverage_score < 0.85` (missing required fields)
  - `risk_flags` contains `safety`, `legal`, `medical`, `financial`, or `security`
  - task intent requires high-stakes precision (e.g., compliance sign-off)
  - user explicitly requests high-accuracy premium analysis
  - cheap pass latency exceeds SLO twice consecutively

## Structured Summary Schema

```yaml
summary_schema:
  task_id: string
  asset_type: image|video|mixed
  language: string
  high_level_summary: string
  extracted_text:
    full_text: string
    segments:
      - start_ms: number|null
        end_ms: number|null
        text: string
        confidence: number
  entities:
    - type: person|org|location|object|brand|other
      value: string
      confidence: number
  events:
    - timestamp_ms: number|null
      description: string
      confidence: number
  design_signals:
    layout_observations: [string]
    style_notes: [string]
    ux_issues: [string]
  quality:
    confidence_score: number
    coverage_score: number
    uncertainty_notes: [string]
  risk_flags: [string]
  recommended_action: finalize|promote
  promotion_reason: string|null
  processing:
    model_tier: cheap_mm|premium_mm
    model_name: string
    input_tokens_est: number
    output_tokens_est: number
    latency_ms: number
    estimated_cost_usd: number
```

## Promotion Packet (When Escalating)

When promoting, forward:

- original assets (or secure references),
- preprocessing artifacts (keyframes/transcript),
- cheap-pass `summary_schema`,
- specific unresolved questions,
- threshold trigger(s) that caused escalation.

This avoids repeated extraction and preserves cost savings.

## Acceptance Criteria

- Every multimodal task produces a `summary_schema` object.
- At least one cheap-pass attempt occurs before premium escalation (except policy bypass).
- Promotion includes explicit trigger reason.
- Route metadata logs latency + cost for optimization.

## Operational Notes

- Use deterministic prompts/templates for cheap model extraction to reduce variability.
- For long videos, cap first pass to sampled key segments; escalate only if unresolved.
- Cache reusable artifacts (OCR, transcript, keyframes) per asset hash.
- Apply privacy policy before external model calls (redaction where required).
