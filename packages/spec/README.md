# @ifi/pi-spec

Native spec-driven workflow for pi, inspired by [github/spec-kit](https://github.com/github/spec-kit).

`@ifi/pi-spec` is a **pi extension package**, not a shell wrapper and not a general-purpose JavaScript
library. Its job is to bring the core spec-kit workflow into pi as a native TypeScript experience:

- one `/spec` command instead of a pile of separate commands and shell entrypoints
- deterministic local scaffolding under `.specify/`
- deterministic feature artifacts under `specs/###-feature-name/`
- native git/repo detection, branch naming, and feature numbering in TypeScript
- prompt handoff back into pi via `pi.sendUserMessage(...)`
- project-owned templates that can be customized locally after initialization

The package deliberately keeps the **mental model** of spec-kit, but replaces its shell orchestration with
normal pi tools and normal pi conversations.

## Install

```bash
pi install npm:@ifi/pi-spec
```

Or install the full oh-pi bundle:

```bash
npx @ifi/oh-pi
```

---

## Purpose

The purpose of this package is to make **spec-first development** feel native inside pi.

In practice that means:

1. **Requirements come first**
   - You write or refine a spec before planning and implementation.
2. **The workflow is explicit**
   - `/spec:specify`, `/spec:plan`, `/spec:tasks`, `/spec:implement` are separate steps with clear outputs.
3. **The repository owns the workflow state**
   - Important artifacts live in normal files in your repo, not in hidden runtime state.
4. **Pi stays in control of the work**
   - Instead of calling external shell scripts, pi reads templates, edits files, runs tests, and explains what it did.
5. **Teams can customize locally**
   - The package seeds `.specify/templates/`, then gets out of the way.

## Goals

The design goals for `@ifi/pi-spec` are:

- **Native pi UX** — use pi's existing tools, prompting, and slash-command system
- **Spec-kit compatibility of concepts** — keep the same major phases and familiar artifact layout
- **Type-safe implementation** — perform repo detection, path calculation, and branch generation in TypeScript
- **Idempotent scaffolding** — create missing files without constantly overwriting local customizations
- **Low surprise** — make state visible through files and `/spec:status`
- **Good defaults, flexible templates** — ship usable templates while letting projects evolve them

## Non-goals

This package intentionally does **not** try to be:

- a 1:1 shell-script port of upstream spec-kit internals
- a hidden autonomous pipeline that silently runs every step for you
- a generic npm library with a stable programmatic JS API
- a hook runner that auto-executes `.specify/extensions.yml` scripts behind your back

The stable API surface is the **slash command** and the **on-disk workflow structure**.

---

## The API I chose

### Public API surface

The package has one primary public entrypoint:

```text
/spec [subcommand] [freeform input]
```

Supported subcommands:

<!-- {=piSpecSubcommandsDocs} -->

Canonical `/spec` subcommands exposed by the extension. Keep README command lists and exported type
metadata in sync with this source of truth: `status`, `help`, `init`, `constitution`, `specify`,
`clarify`, `checklist`, `plan`, `tasks`, `analyze`, `implement`, `list`, and `next`.

<!-- {/piSpecSubcommandsDocs} -->

That is the **intentional public API**.

There is **not** a separate public JS/TS library API right now. Internal modules like
`workspace.ts`, `scaffold.ts`, or `prompts.ts` are implementation details for contributors, not a versioned
integration surface for consumers.

Core workflow steps:

<!-- {=piSpecWorkflowStepsDocs} -->

Workflow steps that hand work back into pi for feature execution. These ordered steps are
`constitution`, `specify`, `clarify`, `checklist`, `plan`, `tasks`, `analyze`, and `implement`.
Keep contributor-facing docs aligned with the same sequence.

<!-- {/piSpecWorkflowStepsDocs} -->

### Why one `/spec` command is the right API

I chose **one command with subcommands** instead of many top-level commands like `/specify`, `/clarify`,
`/plan`, `/tasks`, etc. for a few reasons:

1. **It matches the workflow mental model**
   - All of these actions are part of one lifecycle.
   - Grouping them under `/spec` makes that lifecycle obvious.

2. **It avoids namespace clutter in pi**
   - A spec workflow can easily consume half a dozen top-level slash commands.
   - `/spec ...` keeps the command surface organized.

3. **It is easier to discover**
   - `/spec:help`, `/spec:status`, and `/spec:next` make the system self-explanatory.
   - Users only need to remember one root command.

4. **It preserves upstream familiarity without copying the shell UX**
   - The step names still map cleanly to spec-kit concepts.
   - But the runtime behavior is pi-native instead of script-native.

5. **It centralizes context resolution**
   - Repo detection, active-feature resolution, scaffold creation, and prompt generation all happen in one place.
   - That reduces edge cases and keeps behavior consistent.

### Why the API is file-centric

The second part of the API is the **filesystem contract**:

- `.specify/` for reusable workflow state and templates
- `specs/###-feature-name/` for per-feature artifacts

I think this is the correct design because it keeps the workflow:

- reviewable in git
- easy to inspect manually
- easy to customize
- resilient across agent restarts
- tool-agnostic at the file layer

In other words, the source of truth is not some in-memory session object; it is the repo itself.

---

## Exact command behavior

Below is the practical contract for each subcommand.

| Command                               | Purpose                                                    | Model handoff | Filesystem side effects                                                  |
| ------------------------------------- | ---------------------------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| `/spec` or `/spec:status`             | Show current workflow state                                | No            | None                                                                     |
| `/spec:help`                          | Show available commands and guidance                       | No            | None                                                                     |
| `/spec:init`                          | Create the base workflow scaffold                          | No            | Creates missing `.specify/` files                                        |
| `/spec:constitution [principles]`     | Create or revise the project constitution                  | Yes           | Ensures base scaffold exists                                             |
| `/spec:specify <feature description>` | Create the next numbered feature workspace                 | Yes           | Ensures scaffold, creates `specs/###-.../`, may create/switch git branch |
| `/spec:clarify [focus]`               | Ask and resolve high-impact ambiguities in the active spec | Yes           | Ensures scaffold exists                                                  |
| `/spec:checklist [domain]`            | Generate or refine requirement-quality checklists          | Yes           | Ensures scaffold exists                                                  |
| `/spec:plan [technical context]`      | Build the implementation plan and design artifacts         | Yes           | Ensures scaffold, creates `plan.md` if missing                           |
| `/spec:tasks [context]`               | Generate an executable `tasks.md`                          | Yes           | Ensures scaffold exists                                                  |
| `/spec:analyze [focus]`               | Run a read-only consistency review                         | Yes           | Ensures scaffold exists                                                  |
| `/spec:implement [focus]`             | Execute tasks and update completion state                  | Yes           | Ensures scaffold exists; prompts if checklists are incomplete            |
| `/spec:list`                          | List known feature directories                             | No            | None                                                                     |
| `/spec:next`                          | Show the next recommended step                             | No            | None                                                                     |

### Input rules

The command accepts **freeform text** after the subcommand.

Examples:

```bash
/spec:constitution Security-first, testable, low-complexity defaults
/spec:specify Add usage-based billing alerts for workspace admins
/spec:plan Use TypeScript, Vitest, and direct pi tool access
/spec:analyze Focus on contradictions between spec.md and tasks.md
/spec:implement Start with the MVP story and update tasks as you go
```

Notes:

- `/spec:specify` effectively requires a real feature description.
- Other workflow steps accept freeform guidance and can also run with minimal or no extra guidance.
- When pi has UI input capabilities available, the extension can prompt for missing input instead of failing immediately.

### Active feature resolution

For steps that operate on a feature (`clarify`, `checklist`, `plan`, `tasks`, `analyze`, `implement`), the
extension resolves the active feature using this order:

1. current branch name if it matches a numbered feature directory
2. a single known feature directory, if there is only one
3. a UI selection prompt, if multiple features exist and the UI supports selection
4. otherwise the latest numbered feature directory

This keeps the common path simple while still working in multi-feature repos.

---

## Files and directories created by the package

### Base workflow scaffold

`/spec:init` creates the base workflow scaffold if it is missing.

```text
.specify/
├── README.md
├── extensions.yml
├── memory/
│   ├── constitution.md
│   └── pi-agent.md
└── templates/
    ├── agent-file-template.md
    ├── checklist-template.md
    ├── constitution-template.md
    ├── plan-template.md
    ├── spec-template.md
    ├── tasks-template.md
    └── commands/
        ├── analyze.md
        ├── checklist.md
        ├── clarify.md
        ├── constitution.md
        ├── implement.md
        ├── plan.md
        ├── specify.md
        └── tasks.md
```

What these are for:

- `.specify/README.md` — local explanation of the workflow as installed in this repo
- `.specify/extensions.yml` — compatibility/config surface; pi inspects it manually when relevant rather than auto-running hooks
- `.specify/memory/constitution.md` — canonical governance/principles file
- `.specify/memory/pi-agent.md` — pi-native replacement for agent-context update scripts
- `.specify/templates/` — local, editable workflow templates copied from the packaged defaults

### Per-feature workspace

`/spec:specify <description>` creates a numbered feature workspace:

```text
specs/
└── 001-my-feature/
    ├── spec.md
    ├── checklists/
    ├── plan.md
    ├── research.md
    ├── data-model.md
    ├── quickstart.md
    ├── contracts/
    └── tasks.md
```

Not every file exists immediately.

Current behavior:

- `spec.md` is scaffolded during `/spec:specify`
- `plan.md` is scaffolded during `/spec:plan` if it is missing
- other files are referenced by the workflow and created as the step needs them

### Idempotency rules

Scaffolding is intentionally conservative:

- missing files are created
- existing files are left alone
- bundled templates are copied into the repo once, then become the repo's copies to edit

That is important because the package should seed a workflow, not keep fighting your local customization.

---

## How to use it in practice

### 1) Initialize the workflow

```bash
/spec:init
```

Use this when introducing the workflow to a repo for the first time.

What happens:

- `.specify/` is created if missing
- default templates are copied in
- constitution and pi-agent memory files are created if missing
- a report is rendered in pi explaining what was created

### 2) Define the project's constitution

```bash
/spec:constitution Security-first, testable, backwards-compatible changes by default
```

Use this to establish the rules the workflow should follow.

Typical outcomes:

- the constitution file is created or updated in `.specify/memory/constitution.md`
- related templates may be aligned with those rules
- future workflow steps can refer back to the same governance file

### 3) Create a feature spec

```bash
/spec:specify Add SSO login for enterprise tenants
```

What happens:

- the next feature number is computed
- a branch name is generated from the description
- `specs/###-feature-name/` is created
- `spec.md` is scaffolded
- if git is available and you are not already on that feature branch, the extension creates and switches to it
- pi receives a prompt instructing it to follow the local `specify` template using the prepared paths

This is the key step that turns a vague idea into a concrete feature workspace.

### 4) Clarify open questions

```bash
/spec:clarify
```

or

```bash
/spec:clarify Focus on tenant boundaries, auth edge cases, and failure states
```

This step is meant to remove the highest-impact ambiguities before planning.

### 5) Generate a requirement-quality checklist

```bash
/spec:checklist Authentication quality gates
```

This is not supposed to generate implementation TODOs. It is meant to verify that the spec is precise,
complete, and testable.

### 6) Build the implementation plan

```bash
/spec:plan Use TypeScript, Vitest, and existing auth services; avoid new infrastructure
```

What happens:

- `plan.md` is created if missing
- pi is instructed to use the local `plan` workflow template
- `pi-agent.md` is treated as the pi-native context artifact instead of shell-generated agent files

### 7) Generate tasks

```bash
/spec:tasks
```

or

```bash
/spec:tasks Prioritize the MVP path and keep tasks grouped by user story
```

This step should produce a `tasks.md` with a strict checkbox-oriented execution plan.

### 8) Analyze for contradictions

```bash
/spec:analyze
```

This step is intentionally read-only. It is there to catch inconsistencies between the spec, plan,
checklists, and tasks before coding begins.

### 9) Implement

```bash
/spec:implement
```

or

```bash
/spec:implement Start with story 1, update tasks.md as each item completes
```

Behavior worth knowing:

- checklist files are summarized before implementation
- if incomplete checklist items exist and the UI supports confirmation, pi asks whether you want to continue
- the implementation prompt reminds pi to mark completed tasks as `[x]`

### 10) Inspect progress any time

```bash
/spec:status
/spec:next
/spec:list
```

Use these when you want visibility rather than action:

- `/spec:status` shows artifact presence, checklist summaries, current branch, and known features
- `/spec:next` recommends the next workflow command
- `/spec:list` lists all numbered feature directories in `specs/`

---

## Example end-to-end session

```bash
/spec:init
/spec:constitution Security-first, testable, low-complexity defaults
/spec:specify Build a native spec workflow package for pi
/spec:clarify
/spec:checklist Requirements quality for the initial MVP
/spec:plan Use TypeScript, Vitest, and direct pi tool access
/spec:tasks Group work by independently testable user stories
/spec:analyze
/spec:implement
```

That sequence is the intended happy path.

---

## Native behavior vs upstream spec-kit

This package is **inspired by** upstream spec-kit, but the runtime model is different on purpose.

### What is preserved

- the phase names and overall lifecycle
- the numbered feature directory convention
- the use of templates to guide each phase
- the idea of constitution/spec/plan/tasks/checklist artifacts

### What changed

- shell scripts are replaced with TypeScript helpers
- repo/branch/path preparation happens inside the extension
- workflow execution is handed back to pi as a normal prompt-driven task
- `.specify/memory/pi-agent.md` replaces agent-update shell behavior
- `.specify/extensions.yml` is preserved as a file, but not auto-executed as hooks

### Why this is the correct adaptation for pi

Because pi already has:

- tools for file IO
- tools for running validation commands
- a conversation model for asking clarifying questions
- slash commands for entering workflows

Using shell wrappers would add indirection without adding capability. Native TypeScript makes the workflow:

- easier to test
- easier to reason about
- more portable across environments
- less dependent on shell behavior differences
- more aligned with how pi already works

---

## Internal implementation overview

These modules are useful for contributors, but they are **not** the promised external API.

- `extension/index.ts` — command registration, dispatch, prompting, and model handoff
- `extension/workspace.ts` — repo detection, feature numbering, branch slugging, and path building
- `extension/scaffold.ts` — idempotent scaffold/template creation
- `extension/prompts.ts` — native workflow prompt builder and step-specific notes
- `extension/status.ts` — status reporting and checklist summarization
- `extension/git.ts` — minimal git adapter used by the workflow
- `extension/assets/templates/` — vendored workflow and file templates adapted from spec-kit

I split the implementation this way because the workflow naturally has four concerns:

1. command API and UX
2. filesystem/workspace logic
3. prompt-generation logic
4. status/reporting logic

Keeping those concerns separate made the package easier to test thoroughly.

---

## Customization

After initialization, you can customize the workflow by editing files in your repo:

- `.specify/memory/constitution.md`
- `.specify/memory/pi-agent.md`
- `.specify/templates/*.md`
- `.specify/templates/commands/*.md`

This is another core design choice: the workflow should become **your repo's workflow**, not remain locked
inside the npm package.

---

## Summary

If I had to describe the package in one sentence:

> `@ifi/pi-spec` is a native pi implementation of a spec-first workflow whose public API is one `/spec`
> command plus a deterministic `.specify/` and `specs/###-feature-name/` file layout.

I think that is the correct API because it is:

- small enough to remember
- explicit enough to inspect
- compatible enough to feel familiar to spec-kit users
- native enough to feel right inside pi
- testable enough to maintain over time
