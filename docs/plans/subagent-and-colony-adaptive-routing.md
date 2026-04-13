# Subagent and Colony Adaptive Routing Spec

> Goal: extend oh-pi's existing adaptive-routing ideas into delegated execution (`subagent`) and ant-colony work while preserving pi's minimal, user-owned, extension-first nature.
>
> Implementation follow-up: `docs/plans/subagent-and-colony-adaptive-routing-implementation.md`

## 1. Problem Statement

Today, oh-pi has three different execution layers with uneven model-selection ergonomics:

1. **Main session routing** can already become model-aware through adaptive routing.
2. **Subagents** accept explicit per-agent `model` frontmatter and runtime overrides, but have no policy-based routing layer.
3. **Ant colony** has ecological roles (`scout`, `worker`, `soldier`) but no first-class user-owned routing policy for those castes.

This creates four recurring problems:

1. **Manual drift** — users must remember which delegated agent should run on which provider/model.
2. **Brittle defaults** — builtins can encode model choices that age poorly as providers, quotas, and pricing change.
3. **Bad spending** — cheap discovery/review tasks may burn premium models because no delegation-aware routing policy exists.
4. **Architecture pressure** — without a policy layer, the easiest path is to hard-code persona-to-model pairings, which pushes the project toward a monolithic orchestration framework instead of composable pi extensions.

## 2. Background and External Analysis

This RFC is informed by a hostile review of `code-yeongyu/oh-my-openagent`.

The review found several useful ideas alongside several patterns that should not be imported into oh-pi.

### 2.1 Ideas worth adapting

- **Agent/model fit matters.** Different delegated roles should express different capability needs.
- **Category-based routing is better than persona mythology.** Delegates should describe the work class, then a deterministic local policy should choose a model.
- **Fallback chains and reserve-aware routing are useful** when they remain explainable and user-owned.
- **Non-interactive git environment enforcement is valuable** because agents cannot safely interact with spawned editors.
- **Partial config loading with warnings is operationally strong** and avoids bricking the whole extension on one bad section.

### 2.2 Ideas explicitly rejected

oh-pi should not copy or emulate these aspects:

- a persona-heavy orchestration religion (`Sisyphus`, `Atlas`, `Prometheus`, etc.)
- hook proliferation that patches core behavior from dozens of directions
- the claim that **human intervention is a failure signal**
- default-on unstoppable continuation loops
- any code or prompt reuse from `oh-my-openagent`

### 2.3 Licensing and clean-room constraint

`oh-my-openagent` is licensed under SUL-1.0. This RFC therefore permits **idea-level inspiration only**.

Implementation must be clean-room:

- no direct code copying
- no prompt copying
- no schema copying verbatim
- no mechanically translated derivatives

## 3. Product Thesis

Delegated execution in pi should use the same philosophy already proposed for main-session adaptive routing:

- **classifier-assisted, deterministic final routing**
- **user-owned policy** instead of hidden black-box orchestration
- **explicit agent/caste intent metadata** instead of hard-coded hero personas
- **opt-in behavior** with strong escape hatches
- **small composable extensions** instead of a side-platform inside pi

Subagents and ant-colony castes should describe **what kind of work they do**, and adaptive routing should decide **which available model should perform that work**.

## 4. Goals

### Primary goals

- Add optional category-based routing for subagents and ant-colony castes.
- Reuse existing adaptive-routing concepts rather than building a parallel model-selection system.
- Preserve explicit runtime overrides (`model`, `thinking`, etc.).
- Keep routing decisions explainable in logs/UI.
- Improve defaults without forcing users into rigid model/provider pairings.

### Secondary goals

- Add guardrails that warn when an agent role is configured with a suspicious model family.
- Introduce shared config-loading helpers that tolerate partial invalid config.
- Add a small non-interactive git execution guard for agent-run git commands.

## 5. Non-Goals

- No new mythological orchestrator personas.
- No giant built-in per-agent fallback tables copied from another project.
- No hidden autonomous loops that continue indefinitely without explicit user opt-in.
- No duplication of pi's native `AGENTS.md` directory loading behavior.
- No reimplementation of all of `oh-my-openagent`'s hook system.
- No mid-turn model switching.

## 6. Design Principles

1. **Pi stays minimal.** New behavior must layer on top of current subagents/colony/adaptive-routing primitives.
2. **Routing remains user-owned.** Users can override categories, model rankings, reserves, and fallback groups.
3. **Explicit beats magical.** Agent definitions should expose category/capability metadata plainly.
4. **Overrides always win.** An explicit per-run `model` beats everything else.
5. **Warnings beat hard bans.** Suspicious configurations should surface explainable warnings before any future hard enforcement is considered.
6. **One routing engine.** Subagents and colony should reuse adaptive-routing policy concepts, not invent bespoke routing logic.

## 7. Proposed Architecture

## 7.1 Delegation-aware routing layers

Subagent and colony model selection should resolve in this order:

1. **Explicit runtime override**
   - `subagent(..., model="provider/id")`
   - slash-command inline override like `/run scout[model=anthropic/claude-sonnet-4] ...`
2. **Explicit agent frontmatter model**
   - `model: provider/id`
3. **Delegation category metadata**
   - agent/caste declares category such as `quick`, `balanced-research`, `peak-reasoning`, `visual-engineering`
4. **Adaptive-routing policy engine**
   - deterministic local policy chooses best available model + thinking
5. **Current fallback behavior**
   - if adaptive routing is unavailable or disabled, existing defaults continue to work

This keeps today's escape hatches intact while enabling policy-driven delegation.

## 7.2 Subagent metadata extensions

Extend subagent definition semantics with optional role metadata.

### Proposed new frontmatter fields

```md
---
name: scout
description: Fast codebase recon
category: quick-discovery
preferredProviders: google, openai
capabilities: fast-read, low-cost, broad-search
modelFamilyHint: cheap
---
```

### Notes

- `category` is the only proposed field that should participate directly in routing.
- `preferredProviders`, `capabilities`, and `modelFamilyHint` are advisory metadata for warnings, TUI presentation, and future routing heuristics.
- Existing `model`, `thinking`, `tools`, `skills`, `output`, and related fields remain supported.

## 7.3 Ant-colony caste metadata

Ant-colony already has meaningful ecological roles:

- **scout** — cheap exploration, broad search, low-context recon
- **worker** — implementation and task execution
- **soldier** — review, criticism, rework requests

This RFC proposes adding routing categories to those castes rather than hard-coding exact provider/model pairs.

### Initial default caste mapping

| Caste | Suggested category | Reason |
|------|---------------------|--------|
| scout | `quick-discovery` | cheap, broad, many parallel calls |
| worker | `balanced-execution` | implementation should prefer balanced quality/cost |
| soldier | `review-critical` | review benefits from stronger reasoning/judgment |

These are defaults, not lock-ins.

## 7.4 Adaptive-routing integration

Rather than creating a second routing engine inside `subagents` or `ant-colony`, delegated routing should reuse adaptive-routing concepts:

- task/intention classification
- fallback groups
- provider reserve thresholds
- deterministic candidate scoring
- explainable decision output

### Proposed integration modes

#### Mode A — category only
Agent/caste category maps directly to configured fallback group / task class.

#### Mode B — category plus task text
Adaptive router may optionally classify delegated task text to refine thinking level or candidate ranking.

#### V1 recommendation
Start with **Mode A**.

Reason:
- cheaper
- easier to explain
- lower risk of invisible routing surprises
- consistent with user-owned policy

## 8. Configuration Model

## 8.1 Shared delegated-routing config

Add a small delegated-routing section under adaptive routing or subagent/colony config.

Illustrative shape:

```json
{
  "delegatedRouting": {
    "enabled": true,
    "categories": {
      "quick-discovery": {
        "fallbackGroup": "cheap-router",
        "defaultThinking": "minimal"
      },
      "balanced-execution": {
        "fallbackGroup": "standard-coding",
        "defaultThinking": "medium"
      },
      "review-critical": {
        "fallbackGroup": "peak-reasoning",
        "defaultThinking": "high"
      },
      "visual-engineering": {
        "fallbackGroup": "design-premium",
        "defaultThinking": "high"
      }
    }
  }
}
```

### Why this shape

- lets users remap categories without editing builtins
- keeps exact provider/model combos in one policy system
- avoids giant hard-coded fallback tables per agent

## 8.2 Fallback groups

Reuse adaptive-routing fallback-group concept rather than duplicating model chains in each agent file.

Illustrative examples:

```json
{
  "fallbackGroups": {
    "cheap-router": [
      "google/gemini-2.5-flash",
      "openai/gpt-5-mini"
    ],
    "standard-coding": [
      "anthropic/claude-sonnet-4-6",
      "openai/gpt-5.4-mini",
      "google/gemini-2.5-pro"
    ],
    "peak-reasoning": [
      "openai/gpt-5.4",
      "anthropic/claude-opus-4.6"
    ]
  }
}
```

## 8.3 Compatibility with existing explicit model fields

No migration should be required.

If an agent already declares:

```md
model: anthropic/claude-opus-4.6
```

that value should continue to work exactly as today.

Category-driven routing only activates when no explicit runtime or frontmatter model is present.

## 9. UX and Tooling

## 9.1 `/agents` and subagent management

Agent detail/edit views should show:

- explicit model (if set)
- category (if set)
- effective routing source:
  - runtime override
  - explicit model
  - category → delegated routing
  - inherited default
- warning badge when configuration looks suspicious

### Example warnings

- `scout` configured with premium review-only model
- `artist` configured with non-visual text-only model family
- `soldier` configured with ultra-cheap quick model

Warnings should be explainable and dismissible, not fatal.

## 9.2 Colony status UI

Colony UI/status should expose:

- caste → category mapping
- resolved model for each spawned ant
- reason code if fallback/reserve rule changed expected route

## 9.3 Slash commands and runtime overrides

Current override syntax should remain intact.

Examples:

```text
/run scout[model=anthropic/claude-sonnet-4] analyze auth
/chain scout[model=openai/gpt-5.4-mini] "scan" -> planner "plan"
```

No new syntax is required for V1.

## 10. Safety and Operational Improvements

## 10.1 Non-interactive git guard

Add a small extension-level safety behavior for agent-run git commands:

- disable editor/pager prompts
- enforce non-interactive environment variables on git commands
- warn on obviously interactive git flows before they hang

This should be implemented as a focused extension concern, not a sprawling hook framework.

## 10.2 Partial config loading

Introduce shared config-loading helpers so these configs:

- adaptive routing
- delegated routing
- subagent extension config
- ant-colony extension config

can tolerate invalid sections without disabling the entire feature.

### Expected behavior

- parse valid sections
- skip invalid section
- log clear warning
- continue with sane defaults

## 11. Alternatives Considered

### A. Hard-code exact provider/model per builtin agent

Rejected.

Why:
- ages badly
- hard to override cleanly
- pushes project toward the `oh-my-openagent` style persona stack
- duplicates routing policy across many files

### B. Build a new orchestration framework with named personas

Rejected.

Why:
- conflicts with pi's modular philosophy
- duplicates subagents + plan + colony primitives
- introduces brand/theater instead of interface discipline

### C. Apply delegated routing only to ant-colony

Rejected for V1.

Why:
- subagents have same underlying problem
- two different delegated model-selection stories would create unnecessary confusion

### D. Full task-text classifier for every delegated call in V1

Deferred.

Why:
- more expensive
- less predictable
- category-only routing is enough to deliver value first

## 12. Risks

### Risk 1 — Hidden routing surprises

If delegated routing silently changes model behavior, users will distrust it.

**Mitigation:**
- explicit precedence order
- explain decisions in UI/status
- shadow/explain mode support where possible

### Risk 2 — Policy duplication

If subagents and colony invent separate fallback logic, the system becomes inconsistent.

**Mitigation:**
- reuse adaptive-routing concepts and helper utilities
- keep one shared routing vocabulary

### Risk 3 — Overfitting to another project's worldview

The easiest wrong move is to imitate `oh-my-openagent`'s orchestration stack rather than adapting its strongest ideas.

**Mitigation:**
- clean-room implementation
- explicit rejection list in this RFC
- keep feature scope narrow and composable

### Risk 4 — Bad warnings become noisy

Capability warnings can become ignored if they are too frequent or too vague.

**Mitigation:**
- start with only high-confidence warnings
- allow opt-out later if needed

## 13. Rollout Plan

## Phase 1 — Foundation

- Add shared partial-config helper for extension configs.
- Add non-interactive git guard extension behavior.
- Add category field support to subagent frontmatter/parser/serializer.
- Add ant-colony caste→category defaults in config.

## Phase 2 — Delegated routing integration

- Add delegated-routing config section.
- Resolve category to fallback group.
- Reuse adaptive-routing candidate selection helpers where practical.
- Surface effective route/explanation in logs and UI.

## Phase 3 — UX hardening

- Add `/agents` detail/edit support for category and warnings.
- Add colony status output showing effective routed model.
- Add tests for precedence, fallback, and warnings.

## Phase 4 — Optional refinement

- Evaluate task-text-assisted delegated classification.
- Consider shadow-mode reporting for delegated routes.
- Consider bounded continuation strategies for autonomous flows, but only as separate explicit RFC work.

## 14. Acceptance Criteria

This RFC is successful when:

1. A subagent can be configured with a `category` and run without an explicit `model`.
2. Delegated routing resolves a concrete model deterministically from user-owned policy.
3. Explicit runtime `model` overrides still win over all routing.
4. Ant-colony castes can use category-based routing without hard-coded provider/model identity.
5. The system can explain why a delegated route was chosen.
6. Invalid delegated-routing config does not disable the entire extension.
7. Agent-run git commands are less likely to hang due to interactive editors/pagers.

## 15. Open Questions

1. Should delegated categories reuse adaptive-routing's existing task-class names exactly, or keep a narrower delegated-only vocabulary?
2. Should colony caste defaults live inside ant-colony config or adaptive-routing config?
3. How much explanation should appear inline versus only in verbose/debug mode?
4. Should capability warnings be emitted only in TUI/management views, or also at runtime?
5. Is a dedicated `standard-coding` fallback group worth adding to adaptive-routing defaults in the same wave?

## 16. Recommendation

Proceed with a **narrow, policy-first implementation**:

- categories, not personas
- fallback groups, not giant hard-coded hero chains
- warnings, not hard bans
- clean-room ideas only
- reuse adaptive-routing primitives wherever possible

This captures the strongest ideas from `oh-my-openagent` while preserving what makes pi and oh-pi valuable: minimalism, explicitness, and user control.
