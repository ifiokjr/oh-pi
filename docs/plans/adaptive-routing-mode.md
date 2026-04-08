# Adaptive Routing Mode Spec

> Goal: let pi operate in a model-agnostic mode where each user prompt is routed to the most appropriate available model and thinking level based on task complexity, task type, user preferences, and remaining provider headroom.

## 1. Problem Statement

Heavy coding workflows increasingly span multiple providers with different strengths, quotas, rate limits, and hidden usage policies. Users are forced to manually guess:

- which model is appropriate for a task
- how much thinking effort is justified
- when a premium provider is too depleted to spend on the current task
- when a comparable fallback from a different provider should be used instead

This guesswork creates three recurring problems:

1. **Wasted premium capacity** — expensive models get used for work that cheaper models could complete.
2. **Bad manual routing overhead** — the user must repeatedly switch models and thinking levels mid-session.
3. **Quota cliff failures** — a preferred provider runs low unexpectedly and the session does not smoothly move to the nearest equivalent alternative.

## 2. Product Thesis

Adaptive Routing Mode should treat model selection as a **user-owned policy system**, not a fully autonomous black box.

The system should use a **cheap classifier model** to estimate task characteristics, but the final route must be chosen by a **deterministic local routing engine** that applies:

- user rankings and preferences
- live model availability from the current pi instance
- logged-in provider state
- model capability metadata
- remaining provider quota / rate-limit headroom
- specialty bias (for example, design vs. peak reasoning)

## 3. Goals

### Primary goals

- Add an opt-in routing mode that automatically selects model and thinking level per prompt.
- Minimize unnecessary premium model usage while preserving quality on hard tasks.
- Prefer the user’s ranked models while gracefully falling back when quota is low or unavailable.
- Make routing explainable enough that the user can trust and override it.

### Secondary goals

- Reuse existing pi / oh-pi primitives where possible:
  - `ctx.modelRegistry.getAvailable()`
  - `pi.setModel(...)`
  - `pi.setThinkingLevel(...)`
  - usage-tracker provider windows and cost data
- Leave room for future providers such as Cursor without redesigning the router.
- Establish an evaluation harness so routing quality can improve over time.

## 4. Non-Goals (v1)

- No mid-stream or mid-turn model switching.
- No fully learned router trained on historical traces.
- No subagent or ant-colony routing in the first release.
- No attempt to fabricate exact quota data for providers that only expose estimated or opaque usage.
- No silent hidden routing with zero explanation.

## 5. User Experience

### Core interaction

When Adaptive Routing Mode is enabled and the user submits a prompt:

1. A cheap routing classifier analyzes the prompt.
2. The classifier returns structured task metadata.
3. A deterministic local policy engine picks:
   - the primary model
   - the thinking level
   - ordered fallback candidates
4. The router applies the chosen model and thinking level before agent execution starts.
5. The UI exposes the decision and the reason.

### User promises

The user should be able to understand:

- what model was chosen
- why it was chosen
- what fallback would be used next
- whether the decision was based on authoritative quota data, estimated quota data, or no quota data

### Expected commands / controls

Adaptive Routing Mode should eventually expose:

- `/route on`
- `/route off`
- `/route status`
- `/route explain`
- `/route lock`
- `/route unlock`
- `/route refresh`
- `/route feedback good|bad`

## 6. Routing Architecture

## 6.1 Two-stage routing

### Stage A — cheap prompt classification

A low-cost router model classifies the prompt into structured fields such as:

- `intent`
- `complexity`
- `risk`
- `expectedTurns`
- `toolIntensity`
- `contextBreadth`
- `recommendedTier`
- `recommendedThinking`
- `confidence`
- `reason`

The classifier must not directly choose the final model. It only produces structured metadata.

### Stage B — deterministic policy engine

The local router computes the final route using:

- classifier output
- current model registry availability
- user preference config
- provider quota headroom
- fallback policies
- model specialty tags
- thinking support and clamping rules

This stage outputs:

- selected model
- selected thinking level
- fallback chain
- explanation payload

## 6.2 Why deterministic final routing

The router must remain debuggable and user-controllable. The classifier is allowed to estimate task shape, but user policy must decide final model selection. This avoids hidden model roulette and makes the system testable.

## 7. Routing Inputs

### 7.1 Runtime inputs

The router should consume:

- available models from `ctx.modelRegistry.getAvailable()`
- current selected model / thinking level
- provider auth availability
- usage-tracker snapshots via `pi.events` (`usage:query` / `usage:limits`)
- optional sticky-session state

### 7.2 Model capability inputs

Each candidate model should be normalized into a routing capability record containing at least:

- provider id
- model id
- full name
- reasoning support
- max supported thinking level
- context window
- cost metadata if known
- task specialty tags
- provider family / fallback group
- quota confidence (`authoritative | estimated | unknown`)

### 7.3 User preference inputs

The user should be able to define:

- a global ranked list of preferred models
- task-intent overrides (for example, design prefers Claude)
- premium reserve thresholds per provider
- router classifier model candidates
- default thinking preferences by task tier
- sticky routing behavior
- opt-out model lists

## 8. Classification Schema

The routing classifier should emit strict JSON with a schema like:

```json
{
  "intent": "design",
  "complexity": 4,
  "risk": "high",
  "expectedTurns": "few",
  "toolIntensity": "medium",
  "contextBreadth": "medium",
  "recommendedTier": "premium",
  "recommendedThinking": "high",
  "confidence": 0.82,
  "reason": "Design-heavy judgment task with likely iteration."
}
```

## 9. Routing Policy

## 9.1 Candidate scoring

Each eligible model should receive a weighted score based on:

- user ranking
- intent affinity
- complexity fit
- thinking support fit
- provider reserve status
- quota headroom
- recent provider errors / rate limits
- current-model stickiness bonus
- explicit task overrides

## 9.2 Provider reserve rules

The router should support rules like:

- preserve at least N% of OpenAI premium headroom for peak tasks
- preserve at least N% of Anthropic premium headroom for design tasks
- stop spending a provider when it has crossed a configured reserve threshold unless the task is marked peak-critical

## 9.3 Fallback groups

The router should support semantic fallback groups, for example:

- `peak-reasoning`: GPT 5.4 ↔ Claude Opus 4.6 ↔ future Cursor premium model
- `design-premium`: Claude Opus 4.6 ↔ GPT 5.4
- `standard-coding`: Claude Sonnet ↔ GPT mini / balanced GPT tier
- `cheap-router`: Gemini Flash ↔ GPT mini

## 9.4 Thinking-level selection

Thinking level should be selected separately from model choice and then clamped to model/provider support:

- `off`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`

If a selected model does not support the requested level, the router must clamp and record that in the explanation.

## 10. Quota / Usage Semantics

The router must distinguish:

### Authoritative quota

Real provider window data from usage-tracker or provider APIs.

### Estimated quota

Best-effort usage heuristics where the provider does not expose an authoritative remaining budget.

### Unknown quota

No reliable quota signal is available.

The UI and explanation payload must expose this confidence level explicitly.

## 11. Integration Plan

## 11.1 v1 integration points

- `before_agent_start` hook to apply routing before the agent loop begins
- `/route` commands for status and control
- usage-tracker event integration for provider windows and costs
- footer / status overlay visibility for route decisions
- a shadow mode that suggests routes before auto-applying them

## 11.2 Future integration points

- subagent default routing
- ant-colony caste/model routing
- Cursor provider participation
- user feedback loop and offline policy tuning

## 12. Configuration Shape (Draft)

```json
{
  "enabled": false,
  "mode": "shadow",
  "routerModels": [
    "google/gemini-2.5-flash",
    "openai/gpt-5-mini"
  ],
  "stickyTurns": 1,
  "telemetry": {
    "mode": "local",
    "privacy": "minimal"
  },
  "providerReserves": {
    "openai": { "minRemainingPct": 15 },
    "anthropic": { "minRemainingPct": 15 },
    "cursor-agent": { "minRemainingPct": 20, "confidence": "estimated" }
  },
  "intentOverrides": {
    "design": [
      "anthropic/claude-opus-4.6",
      "openai/gpt-5.4"
    ],
    "architecture": [
      "openai/gpt-5.4",
      "anthropic/claude-opus-4.6"
    ]
  },
  "taskClasses": {
    "quick": {
      "defaultThinking": "minimal",
      "candidates": [
        "google/gemini-2.5-flash",
        "openai/gpt-5-mini"
      ]
    },
    "design-premium": {
      "defaultThinking": "high",
      "candidates": [
        "anthropic/claude-opus-4.6",
        "openai/gpt-5.4"
      ]
    },
    "peak": {
      "defaultThinking": "xhigh",
      "candidates": [
        "openai/gpt-5.4",
        "anthropic/claude-opus-4.6",
        "cursor-agent/<best-available>"
      ]
    }
  }
}
```

## 13. Correctness and Evaluation Strategy

Adaptive Routing Mode must measure correctness at three distinct layers:

1. **Classifier correctness** — did the cheap model estimate task shape reasonably?
2. **Routing correctness** — given the task estimate and runtime inputs, did the policy engine choose the right model and thinking level?
3. **Outcome correctness** — did the selected route help the user finish successfully with less unnecessary premium spend?

These layers must be measured separately because a classifier can be imperfect while the policy still recovers, and a reasonable route can still produce a bad outcome.

## 13.1 Offline evaluation corpus

The router should maintain a labeled prompt corpus covering realistic coding workflows. Each fixture should capture:

- prompt text or a privacy-safe canonicalized form
- expected intent
- expected complexity bucket
- expected risk level
- preferred model tier
- preferred thinking level
- acceptable fallback alternatives

The corpus should support:

- classifier field accuracy
- near-match vs unacceptable mismatch analysis
- policy-engine route regression checks
- future tuning without shipping personal user data in the repository

## 13.2 Shadow mode

The first practical rollout should include a **shadow mode** where the router computes and explains a suggested route but does not automatically apply it.

Shadow mode exists to answer:

- how often does the router agree with the user’s manual choice?
- where does it disagree?
- are disagreements concentrated around certain intents, providers, or thinking levels?

Shadow mode should log disagreement events locally so the router can be tuned before aggressive automation becomes the default.

## 13.3 Correctness signals

### Explicit feedback

The router should support explicit feedback because it is the cleanest signal available. Useful categories include:

- `good`
- `bad`
- `wrong-intent`
- `overkill`
- `underpowered`
- `wrong-provider`
- `wrong-thinking`

### Implicit signals

The router may also use local implicit signals, but these are weaker and must be treated carefully. Examples include:

- immediate manual model switch after a route decision
- immediate thinking-level increase after a route decision
- repeated retries of the same task after a weak result
- escalation from a cheap route to a premium route
- unusually high turn counts for a supposedly easy task

Implicit signals should inform diagnostics and tuning, but should not be treated as ground truth without corroboration.

## 14. Telemetry and Privacy Strategy

Telemetry should be **local-first, opt-in, and privacy-preserving**.

The default design should avoid repo pollution and store router telemetry in shared pi storage under the user agent directory.

## 14.1 Telemetry modes

Supported modes should be:

- `off` — no persisted router telemetry
- `local` — local-only event logs and aggregates under shared pi storage
- `export` — local collection plus explicit user-triggered export of redacted traces

Remote collection should not be part of the initial design.

## 14.2 Privacy levels

Supported privacy levels should be:

- `minimal` — no raw prompt storage; only hashes and structured route metadata
- `redacted` — redacted summaries or snippets where feasible
- `full-local` — raw prompt content stored locally only when explicitly enabled

The default should favor `local` telemetry with `minimal` privacy.

## 14.3 Local telemetry storage

Example storage layout:

- `~/.pi/agent/adaptive-routing/events.jsonl`
- `~/.pi/agent/adaptive-routing/aggregates.json`
- `~/.pi/agent/adaptive-routing/evals/`

## 14.4 Suggested event types

The telemetry model should support events like:

- `route_decision`
- `route_override`
- `route_feedback`
- `route_outcome`
- `route_shadow_disagreement`

A route decision event should include enough information to distinguish classifier error from policy error, including:

- classifier output
- selected route
- top candidate scores
- fallback chain
- quota confidence state
- explanation codes

## 14.5 Tuning from telemetry

Telemetry should initially be used for:

- route disagreement reports
- override-rate analysis
- premium overuse / underuse analysis
- per-intent failure clustering
- user-approved config suggestions

The first tuning system should recommend config changes rather than silently self-modifying policy.

## 15. Acceptance Criteria

### v1 acceptance

- The mode can be enabled and disabled without restarting pi.
- A prompt entered in routing mode chooses both a model and a thinking level before execution.
- The chosen route respects available models in the current pi instance.
- The chosen route prefers configured user rankings and intent overrides.
- The chosen route responds to live provider headroom when usage-tracker data is available.
- The system exposes a human-readable explanation of the decision.
- Manual override remains possible at any time.
- Shadow mode can suggest routes without auto-applying them.

### quality acceptance

- The user should need to manually override fewer prompts over time.
- Premium usage should drop for low-complexity work.
- Peak-quality tasks should still route to premium models when warranted.
- Route disagreement and feedback data should make misrouting patterns diagnosable locally.

## 16. Risks

- Misclassification from the cheap classifier can route tasks too low.
- Aggressive reserve policies can over-conserve premium capacity and hurt quality.
- Opaque “unlimited” plans do not expose exact remaining usage, so confidence labeling is critical.
- Too much hidden automation will reduce trust even if the routing is technically correct.
- Implicit telemetry can be noisy and should not be mistaken for ground truth.
- Over-collecting prompt data would create privacy risks and damage trust.

## 17. Rollout Strategy

### Phase 1

- spec + config schema + pure local decision engine

### Phase 2

- evaluation corpus + cheap classifier integration

### Phase 3

- shadow mode + route disagreement logging

### Phase 4

- interactive routing mode in the main session UI

### Phase 5

- usage-aware fallback tuning + local telemetry reports + feedback-driven tuning

### Phase 6

- subagents / ant-colony / Cursor expansion

## 18. Open Questions

- Which cheap router model should be the default for classification?
- Should route decisions be sticky for one turn, a whole task, or until manual unlock?
- Should “design” and “architecture” be hard-coded starter intents or fully user-configurable from day one?
- How should the router behave when usage-tracker data is stale but still cached?
- Which implicit signals are strong enough to surface in reports but weak enough to keep out of automatic policy changes?
- Should user-approved tuning suggestions edit router config directly or generate reviewable proposals first?
