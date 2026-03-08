# 🐜 Oh-Pi Colony Biomimicry Architecture — Deep Analysis Report

> Generated: 2026-02-16 14:14 GMT+8 (revised, verified line-by-line against source)
> Written from scout intelligence | ant-colony worker output

---

## Table of Contents

1. [Project Architecture Overview](#1-project-architecture-overview)
2. [Colony Biomimicry Mapping](#2-colony-biomimicry-mapping)
3. [Simple Rules → Emergent Intelligence: Feasibility Assessment](#3-simple-rules--emergent-intelligence-feasibility-assessment)
4. [Specific Improvement Suggestions](#4-specific-improvement-suggestions)
5. [Risk Points & Non-Colony Parts to Preserve](#5-risk-points--non-colony-parts-to-preserve)

---

## 1. Project Architecture Overview

### 1.1 Code Scale

| Layer | Modules | Key Files | Total Lines |
|-------|---------|-----------|-------------|
| `src/` core | 16 | bin(1) + index + types + i18n + utils(3) + tui(9) | ~1,731 |
| `ant-colony` extension | 7 (incl. index) | types + nest + queen + spawner + concurrency + deps + index | ~2,373 |
| `pi-package` resources | 40 | extensions(9) + agents(5) + prompts(10) + skills(10) + themes(6) | — |

### 1.2 Data Flow

```
User input ──▶ queen decomposes tasks ──▶ spawner hatches ants ──▶ ants execute
     ▲                                                               │
     └──── nest pheromone feedback ◀─────────────────────────────────┘
```

---

## 2. Colony Biomimicry Mapping

### 2.1 Module → Colony Role Mapping

| Module | Colony Role | Mapping Rationale |
|--------|-------------|-------------------|
| **queen.ts** | 🐜 Queen | Task decomposition hub, sub-task injection into nest, triggers re-exploration |
| **nest.ts** | 🏠 Nest | Pheromone JSONL storage & decay (10-min half-life), ε-greedy weighted scheduling |
| **spawner.ts** | 🥚 Nursery | Hatches scout/worker/soldier/drone per task type via pi SDK |
| **concurrency.ts** | 🚦 Traffic Control | Exploration/steady-state dual-phase adaptive concurrency |
| **deps.ts** | 🗺️ Scout Map | Import graph construction, file lock dependency awareness |
| **types.ts** | 📜 DNA | Global interface definitions, defines colony behavior boundaries |

### 2.2 Ant Lifecycle Mapping

```
scout → worker → soldier → (drone)
  │        │         │         │
  │        │         │         └─ Zero-cost bash execution (execSync)
  │        │         └─ Handles complex/conflict tasks, needs more context
  │        └─ Executes concrete coding tasks, reads/writes files
  └─ Scouts the codebase, collects pheromones (read-only)

Lifecycle: task assignment → pheromone read → execute → pheromone write → death/upgrade
```

---

## 3. Simple Rules → Emergent Intelligence: Feasibility Assessment

### 3.1 Core Proposition

> Each ant follows simple rules, but group behavior produces emergent intelligence.

### 3.2 Current Emergence Points

| Mechanism | Location | Simple Rule | Emergent Effect | Maturity |
|-----------|----------|-------------|-----------------|----------|
| **Pheromone-weighted scheduling** | nest.ts | Read JSONL → sort by weight → ε-greedy select | Colony auto-focuses on high-value areas; 10% random avoids crowding | ⭐⭐⭐⭐ |
| **Negative pheromone penalty** | nest.ts | warning ×2 / repellent ×3 penalty | Failed paths auto-avoided by subsequent ants | ⭐⭐⭐ |
| **Recursive sub-task spawning** | spawner.ts, queen.ts | Ant output → parseSubTasks → inject into nest | Complex problems auto-decomposed | ⭐⭐⭐⭐ |
| **Adaptive concurrency** | concurrency.ts | Exploration high → steady-state converge → CPU/memory hard limits | Resource utilization auto-optimized | ⭐⭐⭐ |
| **Re-exploration loop** | queen.ts | discoveries > completions → re-dispatch scouts | Continuous exploration self-healing | ⭐⭐⭐ |
| **ε-greedy random foraging** | nest.ts | 10% probability random task selection | Avoids local optima, maintains exploration diversity | ⭐⭐⭐ |

### 3.3 Feasibility Score: 8.0/10 ✅ Feasible

**What's already in place (+):**

1. **Pheromone mechanism is live** — JSONL append-write + 10-min half-life decay. This is the core of ant colony optimization. Time decay prevents the system from being locked by stale info, mapping to the ACO evaporation coefficient ρ.

2. **Negative pheromones implemented** — warning type penalty ×2, repellent type penalty ×3. Failed paths are auto-avoided by subsequent ants — a direct mapping of real ant "danger signals."

3. **ε-greedy random foraging** — 10% probability random task selection avoids all ants crowding the same path, maintaining exploration diversity. Maps to individual random deviation behavior in real colonies.

4. **Clear four-phase lifecycle** — scout→worker→soldier→drone progressive task handling, each phase with single responsibility, following the "simple rules" principle.

5. **Dependency-aware conflict prevention** — deps.ts import graph + file lock mechanism, equivalent to ant "territory marking," preventing multiple ants from modifying the same file.

6. **Dual-phase concurrency** — Exploration/steady-state switching models real ant colony foraging/hauling behavior mode switching, with CPU/memory hard constraints.

**What's missing (−):**

1. **Incomplete positive feedback loop** — Current pheromones have write, decay, and negative feedback, but lack **cumulative reinforcement** based on task success rate. In real colonies, successful paths get reinforced by multiple ants, forming "highways."

2. **Insufficient decentralization** — queen.ts is still a centralized scheduler. All phase orchestration logic is concentrated here. Real colonies have no "commander" — each ant decides independently.

3. **Ants communicate only via pheromones** — Missing "direct contact" communication (tandem running). Ants can't directly pass context; they only communicate indirectly via JSONL.

4. **Drone execSync is synchronous blocking** — Violates the async parallel nature of ant colonies.

### 3.4 Gap Matrix vs Real Ant Colonies

```
Real Colony Feature          Current Implementation             Gap
────────────────────────────────────────────────────────────────────
Pheromone deposit/evaporate  ✅ JSONL + 10-min half-life        Small
Negative pheromone (danger)  ✅ warning×2 + repellent×3         Small
Random foraging (diversity)  ✅ ε-greedy 10% random             Small
Positive feedback (path)     ⚠️ Has negative, missing positive  Medium
Decentralized decisions      ❌ queen.ts centralized            Large
Many simple individuals      ✅ scout/worker/soldier/drone      Small
Environmental sensing        ✅ deps.ts + detect.ts             Small
Self-organization            ⚠️ Adaptive concurrency + re-explore Medium
Emergent behavior            ⚠️ 6 points identified, positive FB pending Medium
```

---

## 4. Specific Improvement Suggestions

### 4.1 Pheromone Mechanism Enhancement

#### A. Introduce Pheromone Reinforcement Coefficient

Current nest.ts only has decay. Recommend adding success-based reinforcement for a positive feedback loop.

#### B. Multi-Dimensional Pheromones

| Dimension | Meaning | Use |
|-----------|---------|-----|
| α path pheromone | "This file was successfully modified" | Guide workers to prioritize |
| β danger pheromone | "Modifying this file caused failure" | Warn subsequent ants |
| γ food pheromone | "This area has many pending tasks" | Attract more scouts |

#### C. Pheromone Diffusion

Current pheromones only mark exact files. Recommend adding **diffusion**: successful pheromone on `foo.ts` should spread with decay to `foo.test.ts` and `foo`'s import dependencies (reuse deps.ts import graph).

### 4.2 Positive Feedback Loop

#### A. Ant Scoring System

```
Task complete → auto-evaluate:
  ├─ Compiles? +2 points
  ├─ Tests pass? +3 points
  ├─ No file conflicts? +1 point
  └─ All sub-tasks complete? +2 points

Score feeds back to:
  ├─ Pheromone weight (high score = strong pheromone)
  ├─ Ant type selection (high-score paths prioritize workers over scouts)
  └─ Concurrency adjustment (increase concurrency in high-score areas)
```

### 4.3 Decentralization

#### A. Queen Responsibility Split (Most Critical Improvement)

```
Current (centralized):
  queen.ts — decompose + schedule + monitor + re-explore

Proposed (decentralized):
  queen.ts (slimmed to ~200 lines) — initial task decomposition only
  forager.ts (new ~150 lines) — ants autonomously select tasks by pheromone
  evaluator.ts (new ~100 lines) — post-completion evaluation & pheromone update
  recruiter.ts (new ~80 lines) — re-exploration/recruitment logic
```

### 4.4 Other Improvements

| Improvement | Priority | Description |
|-------------|----------|-------------|
| types.ts split | P2 | 144 lines of all types — split into `task.ts` + `ant.ts` + `pheromone.ts` |
| drone async | P2 | execSync → spawn + Promise, maintain colony's async nature |
| Pheromone visualization | P3 | TUI panel showing real-time pheromone concentration heatmap |
| Ant log standardization | P3 | Unified `[caste:id] action → result` format |

---

## 5. Risk Points & Non-Colony Parts to Preserve

### 5.1 High Risk Points

#### 🔴 Risk 1: Drone Command Injection (spawner.ts)

Drone ants directly execute bash commands. If task descriptions are injected with malicious commands, arbitrary code execution is possible. Recommendations: command allowlist, argument escaping, optional Docker sandbox.

#### 🟡 Risk 2: Pi SDK Tight Coupling (spawner.ts — 18 API imports)

No adapter layer. SDK version upgrades could cause widespread breakage. Recommendation: add pi-adapter.ts abstraction layer.

### 5.2 Parts to Preserve (NOT Colony-ize)

| Module | Reason to Preserve |
|--------|-------------------|
| **src/tui/\*** (9 screens) | User interaction is synchronous and deterministic; not suited for async emergence. TUI needs strict state machine control. |
| **src/i18n.ts** | Pure mapping logic, no need for intelligent scheduling. |
| **src/bin/oh-pi.ts** | CLI entry point must be deterministic — can't "emerge" different startup behaviors. |
| **pi-package/themes/\*** | Pure static JSON config, no behavioral logic. |
| **pi-package/prompts/\*** | Predefined text templates — should stay human-curated, not auto-generated. |
| **src/utils/detect.ts** | Environment detection needs deterministic results. |

### 5.3 Colony Boundary Recommendation

```
                    ┌─────────────────────┐
                    │  Deterministic Layer │
                    │  (preserve as-is)   │
                    │  bin/ tui/ i18n     │
                    │  detect themes      │
                    │  prompts            │
                    └────────┬────────────┘
                             │ calls
                             ▼
                    ┌─────────────────────┐
                    │  Colony Layer       │
                    │  (enhance)          │
                    │  queen nest spawner │
                    │  concurrency deps   │
                    │  + forager (new)    │
                    │  + evaluator (new)  │
                    └────────┬────────────┘
                             │ uses
                             ▼
                    ┌─────────────────────┐
                    │  Resource Layer     │
                    │  (consumed)         │
                    │  agents skills      │
                    │  extensions         │
                    └─────────────────────┘
```

---

## Appendix: Key Data Quick Reference

| Metric | Value |
|--------|-------|
| ant-colony total code | ~2,373 lines |
| Largest single file | index.ts (627 ln), queen.ts (617 ln) |
| Pheromone half-life | 10 minutes |
| Ant castes | scout, worker, soldier, drone |
| Concurrency phases | Exploration (high) → Steady state (convergent) |
| pi SDK dependencies | 18 API imports (17+1) |
| Emergence points | 6 identified |
| High risk points | 2 (drone injection, types single-file) |
| Medium risk points | 2 (SDK coupling, install monolith) |

---

*This report was auto-generated by colony worker ants, based on scout intelligence.*
*To update, dispatch new scouts for fresh reconnaissance.*
