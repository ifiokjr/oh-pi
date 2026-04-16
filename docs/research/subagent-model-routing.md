# Subagent + Ant Colony model-routing research

## Why this exists

The current subagent and ant-colony model selection flow is still mostly static:

- explicit runtime override wins
- otherwise a frontmatter model wins
- otherwise delegated routing picks the first matching provider or candidate
- otherwise the current session model is reused

That means routing is **not yet aware of**:

- which providers the user has actually logged into right now
- which of those providers are temporarily disabled for delegated work
- provider usage / quota pressure beyond the main adaptive-routing prompt flow
- context-window fit for small vs large delegated tasks
- model speed / latency preferences for quick tasks
- benchmark-backed strengths for design, planning, writing, and coding

## Current state in the repo

### Subagents

Current resolution lives in:

- `packages/subagents/model-routing.ts`
- `packages/subagents/index.ts`
- `packages/subagents/chain-execution.ts`
- `packages/subagents/async-execution.ts`

Today it resolves in this order:

1. runtime override
2. frontmatter `model`
3. delegated category from adaptive-routing config
4. session default

### Ant colony

Current resolution lives in:

- `packages/ant-colony/extensions/ant-colony/routing-config.ts`
- `packages/ant-colony/extensions/ant-colony/queen.ts`
- `packages/ant-colony/extensions/ant-colony/index.ts`

Today each caste / worker class resolves against delegated categories, but selection is still mostly:

- explicit override
- delegated category provider order / fallback group
- current session model

### Adaptive routing already has useful primitives

Useful pieces already exist in:

- `packages/adaptive-routing/index.ts`
- `packages/adaptive-routing/engine.ts`
- `packages/adaptive-routing/normalize.ts`
- `packages/extensions/extensions/usage-tracker.ts`

Those pieces already prove that pi can:

- read available models from `ctx.modelRegistry.getAvailable()`
- listen to `usage:limits` provider usage snapshots
- score models against intent and provider reserve policies

So the missing part is not the whole system. The missing part is a **shared delegated-model selector** with better metadata.

## Public data sources I found

### 1. `models.dev`

Public endpoint:

- `https://models.dev/api.json`

Useful fields:

- provider → models
- context window
- output limit
- reasoning flag
- image support
- tool-call support
- structured-output support
- open-weight flag
- pricing

This is the best public source for **capability metadata and provider/model inventory**.

### 2. BenchLM

Public endpoints:

- `https://benchlm.ai/api/data/leaderboard?limit=250`
- `https://benchlm.ai/api/data/pricing?limit=400`

Useful fields:

- overall score
- category scores: `agentic`, `coding`, `reasoning`, `multimodalGrounded`, `knowledge`, `multilingual`, `instructionFollowing`, `math`
- source type (`Proprietary` vs `Open Weight`)
- context window
- pricing

This is the best unauthenticated public source I found for **open benchmark-backed quality signals**.

### 3. Artificial Analysis

Docs:

- `https://artificialanalysis.ai/api-reference`

Important note:

- it has the best latency / throughput / additional eval data I found
- but it requires an API key, even for the free API

So I think this should be an **optional future enricher**, not the required first step.

## Initial snapshot added in this worktree

Generated file:

- `docs/research/model-intelligence.snapshot.json`

Generator:

- `scripts/generate-model-intelligence-snapshot.mjs`

Current snapshot shape:

- 106 benchmarked models from BenchLM
- 46 open-weight models in that ranked set
- 4,177 provider-model entries in `models.dev`
- 87 benchmarked models matched to at least one public provider catalog entry

The snapshot stores:

- raw category scores
- derived task-fit scores for:
  - `design`
  - `planning`
  - `writing`
  - `coding`
  - `all`
- context window
- pricing
- provider coverage from `models.dev` when matched
- capability signals like reasoning / multimodal / tool-call / structured output

## Recommended architecture

I think this should become a **two-layer selector**.

### Layer 1: live inventory

This comes from runtime state, not the repo snapshot.

Inputs:

- `ctx.modelRegistry.getAvailable()`
- provider auth / login presence
- usage snapshots from `usage:limits`
- explicit user-disabled providers / models

This answers:

- what can I actually use right now?
- which providers are authenticated?
- which providers are under quota pressure?

### Layer 2: static intelligence

This comes from the repo snapshot.

Inputs:

- benchmark-backed task scores
- context-window metadata
- multimodal / reasoning capabilities
- open-weight / proprietary signal
- pricing
- later: optional latency enrichment

This answers:

- what is this model good at?
- is it strong enough for the delegated task?
- does it have enough context?
- is it likely overkill for a tiny task?

## Proposed selection pipeline

For every delegated task:

1. **Build candidate pool**
   - start from `ctx.modelRegistry.getAvailable()`
   - remove disabled providers
   - remove disabled models
   - optionally require authenticated providers only

2. **Estimate task profile**
   - task kind: `design | planning | writing | coding | review | research`
   - size: `small | medium | large`
   - urgency: `fast | normal | deep`
   - context need: estimated tokens / breadth bucket
   - modality need: text-only vs multimodal

3. **Attach intelligence**
   - join live model candidates with snapshot data
   - if missing, fall back to catalog metadata + name heuristics

4. **Hard filters**
   - not enough context window
   - missing multimodal support
   - user/provider disabled
   - provider reserve breached and task is not allowed to override

5. **Score remaining models**
   - task-fit score from benchmark metadata
   - quota headroom boost for lower-usage providers
   - penalty for expensive / overpowered models on tiny tasks
   - penalty for large-context models when task is small only if a smaller fast model is good enough
   - boost for explicit user preferences
   - later: speed / latency boost when available

6. **Pick primary + fallbacks**
   - one winner
   - 2-3 ordered fallbacks
   - include explanation payload for observability

## Draft config direction

I would not keep this hard-coded inside subagents or ant-colony.

I think the cleanest home is still the adaptive-routing config because:

- it already stores delegated categories
- it already understands provider reserves
- both subagents and ant-colony already read it indirectly

Example direction:

```json
{
  "delegatedRouting": {
    "enabled": true,
    "categories": {
      "quick-discovery": {
        "taskProfile": "planning",
        "preferredProviders": ["groq", "google", "ollama-cloud", "openai"],
        "maxContextTier": "medium",
        "preferFastModels": true
      },
      "implementation-default": {
        "taskProfile": "coding",
        "preferredProviders": ["openai", "google", "ollama-cloud", "ollama"],
        "minContextWindow": 64000
      },
      "visual-engineering": {
        "taskProfile": "design",
        "preferredProviders": ["google", "openai", "ollama-cloud", "ollama"],
        "requireMultimodal": false,
        "minContextWindow": 128000
      },
      "review-critical": {
        "taskProfile": "planning",
        "preferredProviders": ["openai", "google", "anthropic", "ollama-cloud"],
        "preferHighReasoning": true,
        "minContextWindow": 128000
      }
    }
  },
  "delegatedModelSelection": {
    "excludedProviders": ["cursor"],
    "excludedModels": [],
    "preferLowerUsage": true,
    "preferAuthenticatedProviders": true,
    "allowSmallContextForSmallTasks": true,
    "speedSignals": {
      "source": "heuristic"
    },
    "roleOverrides": {
      "subagent:planner": {
        "preferredModels": ["google/gemini-3.1-pro", "openai/gpt-5.4"]
      },
      "colony:scout": {
        "preferredProviders": ["groq", "google", "ollama-cloud"]
      }
    }
  }
}
```

## Task-score mapping I recommend

These are the weights used in the snapshot right now.

### Design

Use when the delegated task is UI/UX, frontend composition, multimodal analysis, or visual engineering.

- `multimodalGrounded`: 45%
- `coding`: 20%
- `instructionFollowing`: 20%
- `reasoning`: 15%

### Planning

Use for scouts, planners, architecture work, research synthesis, and review coordination.

- `reasoning`: 45%
- `agentic`: 25%
- `instructionFollowing`: 20%
- `knowledge`: 10%

### Writing

Use for prose, docs, prompts, summaries, changelogs, and user-facing copy.

- `instructionFollowing`: 45%
- `knowledge`: 30%
- `multilingual`: 15%
- `reasoning`: 10%

### Coding

Use BenchLM coding directly.

- `coding`: 100%

### All

Use overall score directly.

- `overallScore`: 100%

## Important implementation note on context windows

Context should be treated as a **constraint first** and an optimization signal second.

That means:

- if a task obviously needs a large repo slice, do not down-route to a tiny-context fast model
- if the task is tiny, small-context fast models should be allowed to win
- context should be bucketed, not treated as a perfect number because estimates will be noisy

I would start with buckets:

- `small` ≤ 32K
- `medium` ≤ 128K
- `large` ≤ 256K
- `xlarge` > 256K

## Important implementation note on speed

I do **not** think we should fake hard latency numbers in the first version.

Recommended rollout:

1. v1: use benchmark quality + context + quota + lightweight name heuristics (`mini`, `flash`, `haiku`, small open-weight sizes)
2. v2: optional Artificial Analysis enricher when the user provides an API key
3. v3: local runtime telemetry from pi itself so we can learn real-world latency per provider/model

## Suggested implementation order

### Phase 1

- keep the JSON snapshot in-repo
- add a shared model-intelligence loader
- add a shared delegated-model selector used by both subagents and ant-colony
- support provider/model disable lists
- support user role overrides

### Phase 2

- connect usage snapshots so delegated routing prefers lower-pressure providers
- add context-fit scoring
- add fallback explanations in logs / UI

### Phase 3

- add optional latency enrichment
- add local telemetry for actual delegated task outcomes
- feed successful / failed routing outcomes back into ranking

## My recommendation

The best first real implementation is:

1. treat the new snapshot as the static intelligence source
2. move subagents and ant-colony onto one shared delegated selector
3. keep the selector fully runtime-aware of live available models
4. let user config disable providers and pin preferred role models
5. only after that add latency enrichment

That gives you a much better system quickly without waiting for perfect benchmark coverage.
