# Benchmark-Informed Adaptive Routing Plan

> Goal: evolve adaptive routing from simple per-prompt model selection into a benchmark-informed, objective-aware execution planner that can choose the best model, agent profile, skills, tools, and context strategy for realistic coding work.
>
> Related specs:
>
> - `docs/plans/adaptive-routing-mode.md`
> - `docs/plans/subagent-and-colony-adaptive-routing.md`
> - `docs/plans/subagent-and-colony-adaptive-routing-implementation.md`

## 1. Problem Statement

Current adaptive routing is already useful, but it is still mostly a **model picker**.

It can answer questions like:

- which model should handle this prompt?
- which thinking level should we apply?
- which provider should we preserve when quota is low?

It cannot yet answer richer strategy questions such as:

- how well specified is the incoming task?
- how much do available skills change the likely success rate?
- how much do docs and tool availability matter here?
- is the workspace small enough for a cheap fast model, or large enough to justify a stronger planner?
- should the system prefer cost, speed, quality, or robustness under ambiguity?
- should the task stay single-agent, use delegated execution, or escalate into ant-colony work?

That gap matters because the best route for a task is rarely just a single model decision. In practice, the winning execution shape depends on:

- prompt quality and ambiguity
- task scope and repo size
- skill and documentation availability
- enabled tools
- user priorities around cost, speed, or quality
- how well a model or strategy historically performs under similar constraints

## 2. Product Thesis

The long-term product should be a **benchmark-informed, objective-aware execution planner**.

That means separating the work into two connected systems:

1. a **developer-centric benchmark platform** that measures how models and agent configurations perform on realistic coding tasks
2. a **routing engine** that consumes those benchmark-derived priors plus live workspace signals to pick the best execution strategy

The benchmark system produces the evidence. The router consumes that evidence at runtime.

## 3. Why a New Benchmark Platform Is Needed

Generic coding benchmarks are useful, but they usually do not reflect day-to-day developer workflows well enough for routing decisions inside pi.

This project needs a benchmark suite that is explicitly built around real agent work:

- repo navigation
- debugging from incomplete prompts
- implementing small and large changes
- handling vague prompts versus detailed prompts
- working with and without skill packs
- working with and without rich docs/context
- operating under different tool constraints
- succeeding in small repos, medium repos, and large repos

The goal is not to create a single leaderboard of “best model overall.”

The goal is to build a performance map that answers questions like:

- which models do well under weak prompts?
- which models benefit most from strong scaffolding?
- which strategies are cheapest while still passing?
- which models are too fragile without docs or tools?
- which setups scale best to larger codebases?

## 4. Benchmark Platform Requirements

## 4.1 Task corpus

The benchmark platform should maintain a corpus of realistic developer task families.

Each task family should include:

- a repo fixture or workspace snapshot
- a goal statement
- acceptance criteria
- explicit or hidden tests
- multiple prompt-detail variants
- environment profiles to run against
- tags for task type, difficulty, language, and expected scope

### Example task family shape

```json
{
	"id": "typescript/fix-auth-middleware-01",
	"family": "fix-auth-middleware",
	"difficulty": "medium",
	"repoFixture": "fixtures/auth-service-v3",
	"promptVariants": [
		{ "level": 1, "prompt": "fix auth bug" },
		{ "level": 2, "prompt": "fix auth bug in middleware; tests failing" },
		{
			"level": 3,
			"prompt": "fix the auth middleware so invalid session cookies redirect correctly and the failing tests pass"
		}
	],
	"environmentProfiles": ["baseline-minimal", "skills-rich"],
	"scoring": {
		"type": "tests",
		"command": "pnpm test auth"
	},
	"tags": ["debugging", "typescript", "backend"]
}
```

## 4.2 Prompt-detail variants

Every serious task family should have multiple prompt-detail variants so the benchmark can measure robustness under ambiguity.

Suggested ladder:

- **L1 — weak prompt**: vague request with little context
- **L2 — light detail**: some clues, still ambiguous
- **L3 — medium detail**: error context, expected outcome, likely area
- **L4 — strong detail**: acceptance criteria and likely files
- **L5 — scaffolded**: strong detail plus hints, suggested constraints, or plan framing

This lets the benchmark measure how performance changes as prompt quality improves.

## 4.3 Environment profiles

The benchmark should also vary the environment, not just the prompt.

Examples:

- skills on / off / partially enabled
- docs available / not available
- tools fully available / restricted
- small workspace / medium workspace / large workspace
- direct single-agent execution / delegated execution / swarm execution
- rich context injection / thin context injection
- user objective set to cost / speed / quality / balanced

The system should avoid brute-forcing every possible combination. Instead it should use a curated matrix of representative environment profiles.

## 4.4 Deterministic harness

The benchmark platform needs a deterministic harness that can:

- create a sandbox workspace
- mount a repo fixture
- inject a prompt variant
- control which tools, skills, and docs are available
- run the chosen agent or execution strategy under budgets and time caps
- evaluate output through tests or structured scoring
- emit structured results

## 4.5 Core metrics

The harness should capture at least:

- success or failure
- time to first meaningful action
- time to passing tests
- total wall-clock duration
- token usage
- provider/model cost
- retries, dead ends, and escalation behavior
- number of files edited
- number of commands run
- whether hidden constraints were respected

## 4.6 Derived metrics

From those raw metrics, the platform should derive higher-level routing signals such as:

- **ambiguity tolerance**
- **context efficiency**
- **tool dependence**
- **skill leverage**
- **cost efficiency**
- **latency efficiency**
- **large-repo robustness**
- **success under weak prompts**

## 5. Routing Evolution

## 5.1 From model routing to strategy routing

The routing engine should evolve from “pick a model” to “pick an execution strategy.”

A strategy might include:

- execution mode
- primary model
- thinking level
- whether to use subagents or ant-colony
- which skills to enable or prioritize
- which tool profile to expose
- how much docs/context to inject

### Example simple strategy

```json
{
	"executionMode": "single-agent",
	"model": "openai/gpt-5-mini",
	"thinking": "minimal",
	"toolsProfile": "full",
	"docsMode": "standard",
	"skills": []
}
```

### Example richer strategy

```json
{
	"executionMode": "subagents",
	"plannerModel": "openai/gpt-5.4",
	"workerModel": "google/gemini-3.1-pro",
	"thinking": "medium",
	"toolsProfile": "full",
	"docsMode": "rich",
	"skills": ["debug-helper", "coding-style-guide"]
}
```

## 5.2 Runtime feature extraction

The router needs live task features that it does not currently model strongly enough.

It should estimate:

- prompt quality / ambiguity
- constraint density
- likely task scope
- likely file count touched
- repo size and complexity
- available skills
- matched skills for the prompt
- available docs and whether they are likely relevant
- available tools and tool richness
- likely need for planning, multimodal work, or review strength

## 5.3 Objective-aware routing

Routing should become explicitly objective-aware.

The user should be able to prioritize:

- **cost**
- **speed**
- **quality**
- **balanced**
- eventually: **robustness under ambiguity**

The router should not assume a single universal “best.”

A model that is best for weak prompts may be too expensive for routine tasks. A cheap fast model may be perfect for well-scaffolded work. The objective must shape the route.

## 5.4 Start with deterministic policy, not learned autonomy

The first router should stay deterministic and explainable.

A practical first scoring function could combine:

- predicted success probability
- expected cost
- expected latency
- expected robustness under weak prompts
- context-fit risk
- provider availability and quota state

The benchmark platform provides the priors. The live runtime feature extractor provides the task signals. The user objective provides the weights.

## 6. User Preference Authoring

The user wants to be able to define routing priorities in a markdown file.

That is a strong ergonomics choice.

Recommended design:

- markdown file for authoring and review
- normalized JSON generated for fast runtime loading

### Example authoring format

```md
# Routing priorities

priority: cost secondary: quality

defaults: prefer-fast-feedback: true allow-subagents: true allow-ant-colony: false

for large-repos: prefer: quality

for quick-fixes: prefer: speed

for ambiguous-prompts: prefer: robustness
```

The runtime should compile this into a strict routing config shape rather than parsing freeform prose on every task.

## 7. Benchmark Repo / Package Split

A separate benchmark repo is likely the right long-term home for the benchmark platform.

Reasons:

- benchmark fixtures can get large
- results will churn frequently
- external contributors may want to participate
- sandbox runner infrastructure may evolve independently
- result dashboards and benchmark corpora should not overload the main oh-pi repo

Recommended split:

### Keep in `oh-pi`

- adaptive-routing runtime and config
- live feature extraction
- benchmark snapshot loader
- strategy scorer
- explainability and telemetry

### Move to a benchmark repo

- benchmark corpus
- repo fixtures
- sandbox runner harness
- result storage
- result dashboards
- evaluation orchestration
- community runner support later

## 8. Suggested New Components

## 8.1 In `oh-pi`

Potential package additions or expansions:

- `packages/adaptive-routing`
  - prompt quality estimator
  - repo/task feature extraction
  - objective config loader
  - benchmark snapshot consumer
  - strategy scorer
- `packages/subagents`
  - richer strategy metadata for delegated roles
- `packages/ant-colony`
  - caste strategy metadata and routing hooks
- `packages/providers`
  - richer capability metadata and benchmark profile lookup

Potential new packages:

- `packages/benchmark-spec`
- `packages/routing-capabilities`
- `packages/routing-objectives`

## 8.2 In the benchmark repo

Potential packages or services:

- benchmark corpus and schemas
- fixture manager
- sandbox runner
- result collector
- public benchmark snapshot generator
- optional dashboard UI

## 9. Sandbox and Donated Benchmark Time

A shared sandbox benchmark mode is plausible, but it should not be the first deliverable.

The eventual system could allow users to donate benchmark execution time by running signed benchmark bundles locally and uploading verified results.

That requires:

- signed benchmark bundles
- containerized execution
- strict budget caps
- no secret leakage by default
- limited network access
- resource isolation
- result integrity checks
- anti-tampering controls

This is valuable, but it is a later phase after the benchmark schema, runner, and offline workflow are stable.

## 10. Main Risks

### 10.1 Matrix explosion

Prompt detail × tools × docs × skills × repo size × execution mode × model/provider combinations can explode quickly.

The platform should use representative environment profiles and stratified sampling instead of exhaustive enumeration.

### 10.2 Benchmark overfitting

If routing tunes itself too tightly against one public benchmark suite, it may game the benchmark instead of improving real-world outcomes.

Mitigations:

- hidden validation tasks
- periodic fixture refreshes
- held-out task families
- local shadow-mode validation against real sessions

### 10.3 Objective mismatch

The best route depends on user priorities. A global winner metric would produce bad routing for many users.

### 10.4 Freshness drift

Provider/model behavior changes quickly, so benchmark priors must be versioned and freshness-weighted.

### 10.5 Runtime unpredictability

As routing gets smarter, it also gets harder to trust unless explainability stays first-class.

That means the system needs strong UX around:

- `/route explain`
- `/route why`
- lock/unlock controls
- route source visibility
- objective visibility

## 11. Proposed Phases

## Phase 1 — MVP benchmark + basic objective routing

Build:

- 20–30 task families
- 3 prompt-detail levels
- 3 environment profiles
- a deterministic runner
- simple result storage
- objective modes: cost, speed, quality, balanced
- benchmark-informed but still rule-based routing

Success criteria:

- can show benchmark-informed routing outperforming static model selection in at least some realistic task clusters
- can explain why different routes win under different prompt-quality and tooling conditions

## Phase 2 — stronger runtime feature extraction

Add:

- prompt quality classifier
- repo-size and task-size estimators
- skill relevance estimation
- docs/context relevance estimation
- better route explanation output

## Phase 3 — strategy routing

Expand from model-only routing to strategy routing:

- single-agent vs delegated vs colony choices
- tool-profile selection
- docs-context policy selection
- skill bundle recommendations or auto-selection

## Phase 4 — large benchmark corpus and dashboards

Scale up to:

- 100+ task families
- hidden validation set
- nightly or scheduled benchmark runs
- benchmark snapshots for routing updates
- dashboards for slice-based performance analysis

## Phase 5 — community sandbox runners

Only after the benchmark system is mature:

- signed task bundles
- local opt-in runners
- verified uploads
- budget controls
- privacy-first defaults

## 12. Recommendation

Treat this as three related projects, not one undifferentiated feature:

1. **benchmark corpus + runner**
2. **objective-aware routing config and policy engine**
3. **benchmark-informed strategy router**

That decomposition keeps the work tractable while still aiming at the real vision.

## 13. Immediate Next Steps

Recommended next implementation steps:

1. define a benchmark task-family schema
2. design a small deterministic runner for local fixtures
3. add objective-aware config to adaptive routing
4. add prompt quality and repo/task feature extraction hooks
5. define a benchmark snapshot format the router can consume
6. start with an offline rule-based scorer before attempting any learned policy layer

## 14. Open Questions

- Should benchmark fixtures live in a dedicated benchmark repo immediately, or start in-tree and move later?
- What is the smallest benchmark corpus that gives useful routing signal without runaway cost?
- Which live features should be mandatory in v1: prompt quality, repo size, skills, docs, or all of them?
- When should routing escalate from single-agent to delegated execution?
- Should the markdown preference file compile automatically, or only on explicit refresh?
- How should stale benchmark priors decay as providers and models change?
