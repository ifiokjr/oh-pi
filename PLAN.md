# PLAN: Positioning Convergence + Architecture Risk Reduction (2026 Q1)

> Goal: Address the 6 most critical issues (positioning, storage, SDK coupling, demo, benchmarks, growth) with an executable plan.

## 0. Problem Mapping (from retrospective)

1. **Unclear positioning**: The boundary between oh-pi (config portal) and subagents (delegated execution) isn't sharp enough.
2. **Storage ceiling**: Pheromones depend on local JSONL — bottleneck for long sessions and multi-instance scenarios.
3. **SDK coupling risk**: `spawner` has deep direct dependency on the pi SDK; upstream breaking changes are high risk.
4. **Missing "wow" moment**: Docs are thorough, but first-time UX lacks a strong demo closure.
5. **Scattered growth**: Multi-language rollout started before community focus — feedback density is too low.

## 1. Execution Principles

- **Small bets, quick feedback**: Weekly docs/UX releases; milestone-based capability releases.
- **One community first**: Focus energy on one developer community to build feedback density.

## 2. Action Items

### Phase A: Foundation (Weeks 1–2)

- Rewrite README information architecture (value proposition first)
- Record and publish a 2-minute asciinema demo
- Add "When NOT to Use Ant Colony" guidance
- Abstract `PheromoneStore` interface with JSONL as default

### Phase B: De-risk (Weeks 3–4)

- Introduce `PiAdapter` anti-corruption layer between spawner and pi SDK
- Build SDK compatibility smoke tests
- Add optional SQLite pheromone store

### Phase C: Prove (Weeks 5–8)

- Publish reproducible evaluation scripts

## 3. Success Criteria

- New user first-run time < 60 seconds
- Storage layer swap doesn't affect queen/nest core logic
- Upstream SDK minor version bump requires changes only in adapter layer
- Published benchmark data with clear benefit boundaries
