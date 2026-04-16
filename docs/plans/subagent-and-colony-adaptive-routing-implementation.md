# Subagent and Colony Adaptive Routing — Implementation Plan

**Branch**: `feat/delegated-routing-subagents-colony`  
**Date**: 2026-04-12  
**RFC**: `docs/plans/subagent-and-colony-adaptive-routing.md`  
**Tracking Issues**: #82, #87, #88, #89, #91, #92, #109

## Summary

Implement delegated adaptive routing in small waves by extending existing oh-pi primitives instead of introducing a new orchestration framework.

The implementation should:

- let subagents and ant-colony castes express routing intent as **category metadata**
- reuse adaptive-routing policy concepts such as fallback groups and provider reserves
- preserve explicit runtime and frontmatter model overrides
- surface explainable routing decisions where practical
- add two supporting infrastructure improvements discovered during RFC work:
  - partial-config loading for extension configs
  - non-interactive git guard for agent-run git commands

## Technical Context

**Language**: TypeScript (strict mode)  
**Primary packages**:
- `packages/adaptive-routing` — adaptive routing package
- `packages/extensions` — safety/runtime extensions
- `packages/subagents` — agent definitions, execution, management UI, schemas
- `packages/ant-colony` — caste configs, spawning, budget planning, UI

**Testing**: Vitest  
**Build tool**: pnpm workspace  
**Existing routing primitives**:
- `packages/adaptive-routing/*`
- `docs/plans/adaptive-routing-mode.md`

## Design Constraints

1. **No parallel routing engine.** Delegated routing must reuse adaptive-routing vocabulary and helpers where possible.
2. **Explicit overrides always win.** Runtime `model` overrides and explicit frontmatter `model` stay authoritative.
3. **Category routing is opt-in.** Agents and castes without category metadata should keep current behavior.
4. **Warnings before enforcement.** Suspicious category/model combinations should warn, not hard fail.
5. **Keep pi minimal.** No persona stack, no broad hook proliferation, no hidden continuation loops.
6. **Clean-room only.** No implementation reuse from `oh-my-openagent`.

## Success Criteria

This plan is complete when:

1. subagents can declare a routing `category` without requiring an explicit model
2. ant-colony castes can map to routing categories in config/defaults
3. delegated routing resolves deterministically from existing policy/config
4. explicit runtime/frontmatter `model` settings still override delegated routing
5. delegated routing decisions are inspectable in at least logs/tool details
6. invalid delegated-routing config sections degrade safely instead of disabling entire features
7. git commands run by agents are less likely to hang on interactive editor/pager prompts

## Proposed PR Slices

### PR 1 — Shared config resilience + git guard

**Goal**: land low-risk infrastructure first

**Scope**:
- add shared partial-config loading helper for extension configs
- add focused non-interactive git guard extension behavior

**Likely files**:
- `packages/extensions/extensions/*` (new helper or focused guard extension wiring)
- `packages/extensions/README.md`
- related tests under `packages/extensions/extensions/*.test.ts`

**Acceptance**:
- invalid config sections are skipped with clear warnings
- agent-run git commands receive non-interactive env protection

---

### PR 2 — Subagent category metadata plumbing

**Goal**: teach subagents to carry routing intent

**Scope**:
- parse and serialize optional `category` field for agents
- expose category in management/detail views
- document category in subagent README and schemas

**Likely files**:
- `packages/subagents/agents.ts`
- `packages/subagents/agent-serializer.ts`
- `packages/subagents/agent-management.ts`
- `packages/subagents/agent-manager-detail.ts`
- `packages/subagents/agent-manager-edit.ts`
- `packages/subagents/README.md`
- `packages/subagents/schemas.ts`
- tests:
  - `packages/subagents/tests/agents.test.ts`
  - `packages/subagents/tests/agent-serializer.test.ts`
  - `packages/subagents/tests/session-churn.test.ts` only if event payloads change

**Acceptance**:
- category survives create/update/serialize/load flows
- category appears in detail output and can be edited through management/TUI paths

---

### PR 3 — Delegated routing resolution for subagents

**Goal**: route subagents through policy when no explicit model is set

**Scope**:
- add delegated-routing config surface
- resolve `category -> fallbackGroup/task class -> selected model`
- enforce precedence order:
  1. runtime override
  2. explicit frontmatter model
  3. delegated category routing
  4. existing default behavior
- add explain/debug metadata to results where practical

**Likely files**:
- `packages/subagents/execution.ts`
- `packages/subagents/index.ts`
- `packages/subagents/types.ts`
- `packages/subagents/settings.ts` if chain inheritance changes are needed
- `packages/adaptive-routing/*` shared helpers/config/types
- tests:
  - `packages/subagents/tests/*`
  - `packages/adaptive-routing/*.test.ts`

**Acceptance**:
- subagent with category and no model gets deterministic routed model
- explicit `model` still bypasses delegated routing
- route source can be explained in output/logs

---

### PR 4 — Ant-colony caste categories + routing

**Goal**: give colony castes policy-driven routing without hard-coded provider/model identity

**Scope**:
- define default caste -> category mapping
- let config override those mappings cleanly
- route caste/class selection through adaptive-routing-compatible policy
- keep existing `modelOverrides` support as higher-priority explicit override

**Likely files**:
- `packages/ant-colony/extensions/ant-colony/types.ts`
- caste/model selection code in ant-colony runtime (spawner/queen/budget planner as needed)
- `packages/ant-colony/README.md`
- tests under:
  - `packages/ant-colony/tests/types.test.ts`
  - `packages/ant-colony/tests/spawner.test.ts`
  - `packages/ant-colony/tests/budget-planner.test.ts`

**Acceptance**:
- scout/worker/soldier can route by category when no explicit model override exists
- existing explicit override paths remain intact
- status output can reveal effective routed model or route source

---

### PR 5 — UX hardening and warnings

**Goal**: make delegated routing understandable and safe

**Scope**:
- show effective route source in `/agents` detail and relevant colony status output
- add high-confidence warnings for suspicious agent/caste configuration
- improve docs for troubleshooting delegated routing

**Likely files**:
- `packages/subagents/agent-manager-detail.ts`
- `packages/subagents/agent-management.ts`
- `packages/subagents/render.ts`
- colony UI/status rendering files
- docs in `packages/subagents/README.md`, `packages/ant-colony/README.md`, `packages/extensions/README.md`

**Acceptance**:
- users can tell whether route came from runtime override, explicit model, or category policy
- warnings are specific and low-noise

## Detailed Work Breakdown

## Phase 0 — Preparation

- [ ] confirm whether delegated categories should reuse adaptive-routing task-class names exactly or use a delegated-only vocabulary
- [ ] confirm where colony caste-category config should live:
  - ant-colony config
  - adaptive-routing config
  - shared delegated-routing config
- [ ] identify which adaptive-routing helpers are reusable as-is vs which need extraction

**Deliverable**: settled vocabulary and config ownership before code churn starts

## Phase 1 — Shared infrastructure

- [ ] implement shared partial-config loader utility
- [ ] migrate one extension config reader to use it as proof of shape
- [ ] implement non-interactive git env guard for git commands
- [ ] add tests for invalid section skipping and git env prefix behavior

**Deliverable**: reusable infra landed before delegated routing touches multiple packages

## Phase 2 — Subagent metadata

- [ ] extend `AgentConfig` with optional `category`
- [ ] parse category in `agents.ts`
- [ ] serialize category in `agent-serializer.ts`
- [ ] support category in management create/update/detail formatting
- [ ] expose category in TUI edit/detail flows
- [ ] document category in README and schemas

**Deliverable**: category becomes stable part of subagent contract

## Phase 3 — Delegated routing engine integration

- [ ] add delegated-routing config shape and normalization
- [ ] map subagent category to fallback-group or routing task class
- [ ] route model in `execution.ts` when runtime/frontmatter model absent
- [ ] add route-source metadata for observability
- [ ] add tests for precedence and deterministic fallback

**Deliverable**: subagent category routing works with existing adaptive-routing policy concepts

## Phase 4 — Ant-colony routing

- [ ] add caste -> category defaults
- [ ] add config override surface
- [ ] resolve routed model for caste/class when no explicit model override exists
- [ ] thread route metadata into colony status where practical
- [ ] add colony tests for precedence and defaults

**Deliverable**: colony uses same routing story as subagents

## Phase 5 — UX and docs hardening

- [ ] add route explanation surfaces in subagent detail/status output
- [ ] add warning heuristics for clearly mismatched role/model setups
- [ ] update docs with examples and troubleshooting notes
- [ ] add regression tests for warning text and displayed route source

**Deliverable**: delegated routing is understandable, not magical

## Open Design Decisions

1. **Vocabulary**: reuse existing adaptive-routing task classes exactly, or introduce delegated-only aliases like `quick-discovery` and `review-critical`?
2. **Config ownership**: put delegated routing under adaptive-routing config, subagent config, ant-colony config, or shared top-level delegated-routing section?
3. **Explanation surface**: always include explanation in normal output, or only in verbose/debug/detail views?
4. **Warning surface**: emit warnings at runtime, in management UIs, or both?
5. **Cursor scope**: leave Cursor-family integration entirely to issue #89 follow-up, or reserve config slots now?

## Risks and Mitigations

### Risk: duplicated routing logic

**Mitigation**: extract shared helper(s) from adaptive-routing rather than reimplementing scoring in `subagents` and `ant-colony`.

### Risk: hidden behavior surprises users

**Mitigation**: preserve strict precedence order and surface route source in detail/log output.

### Risk: category vocabulary churn

**Mitigation**: freeze minimal v1 vocabulary before code work; alias later if needed.

### Risk: warning spam

**Mitigation**: ship only high-confidence mismatch warnings in v1.

## Test Plan

### Unit tests

- config normalization / partial loading
- agent frontmatter parsing/serialization for category
- delegated route resolution precedence
- caste-category default selection
- non-interactive git env prefixing

### Integration tests

- management API create/update/get preserves category
- `subagent` tool execution resolves expected model source
- colony spawning respects explicit overrides before routed defaults

### Regression checks

- existing agents without category still behave as before
- explicit `model` and `thinking` overrides remain intact
- broken delegated-routing config does not disable unrelated extension behavior

## Recommended Execution Order

1. PR 1 — shared infra
2. PR 2 — subagent metadata
3. PR 3 — subagent delegated routing
4. PR 4 — colony delegated routing
5. PR 5 — UX hardening

This ordering keeps the riskiest cross-package behavior until after metadata and infrastructure are stable.
