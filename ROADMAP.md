# oh-pi Roadmap (2026 H1)

> Key judgment: the biggest risk isn't technical implementation — it's **positioning and growth**.

## 1) Product Positioning (Straighten First)

### Primary Positioning

- **oh-pi**: One-click configuration and onboarding portal (install, initialize, theme/extension/skill assembly)
- oh-pi packages provide extensions, skills, themes, prompts, subagents, and config tooling.

### Communication Principles

1. Homepage leads with "30-second setup success"
2. Then shows the full feature catalog
3. Architecture and biomimicry details come last

## 2) Near-Term Milestones

### M1 (1–2 weeks): Experience & Narrative

- [ ] README homepage information architecture rewrite (entry value first)
- [ ] Publish 2-minute demo (asciinema + script)
- [ ] Add "When NOT to use Ant Colony" section to reduce misuse cost

**Success Metrics**

- New user first-run completion rate (install to `pi` usable)
- First session "perceived value" trigger rate (subjective feedback)

### M2 (2–4 weeks): Evolvable Foundation

- [ ] Abstract `PheromoneStore` interface (JSONL as default implementation)
- [ ] Make pheromone decay strategy configurable (per task type)
- [ ] Add SQLite implementation (optional)

**Success Metrics**

- Storage layer swap doesn't affect queen/nest main flow
- State file growth stays controlled during long sessions

### M3 (4–6 weeks): SDK Resilience

- [ ] Introduce `PiAdapter` (anti-corruption layer)
- [ ] `spawner` depends only on adapter layer, no direct scattered SDK calls
- [ ] Add SDK compatibility smoke tests

**Success Metrics**

- Minor upstream SDK version upgrades only require adapter layer fixes

### M4 (6–8 weeks): Evidence-Driven Growth

- [ ] Publish benchmark: single agent vs colony (varying task complexity)
- [ ] Open evaluation methodology and reproducible experiment scripts
- [ ] Community focus: build density in one community first

**Success Metrics**

- Reproducible data proving colony benefit boundaries (when it helps, when it doesn't)

## 3) Non-Goals (Current Phase)

- No distributed colony clusters
- No broad multi-language community operations
- No complex monetization features

## 4) Release Cadence

- Small fast steps: weekly docs/UX minor releases
- Capability releases: per-milestone feature releases
- Every version includes "suitable scenarios + unsuitable scenarios"
