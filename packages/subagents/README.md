<p>
  <img src="banner.png" alt="@ifi/pi-extension-subagents" width="1100">
</p>

# @ifi/pi-extension-subagents

Pi extension for delegating tasks to subagents with chains, parallel execution, TUI clarification, and async support.

Built on top of [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) (MIT).

https://github.com/user-attachments/assets/702554ec-faaf-4635-80aa-fb5d6e292fd1

## Installation

```bash
pi install npm:@ifi/pi-extension-subagents
```

Or install it as part of the full oh-pi bundle:

```bash
npx @ifi/oh-pi
```

Or use the package installer directly:

```bash
npx @ifi/pi-extension-subagents
npx @ifi/pi-extension-subagents --local
```

To remove:

```bash
npx @ifi/pi-extension-subagents --remove
```

## Agents

Agents are markdown files with YAML frontmatter that define specialized subagent configurations.

**Agent file locations:**

| Scope | Path | Priority |
|-------|------|----------|
| Builtin | Bundled with this package in `agents/` | Lowest |
| User | `~/.pi/agent/agents/{name}.md` | Medium |
| Project | `~/.pi/agent/subagents/project-agents/<mirrored-workspace>/agents/{name}.md` (searches mirrored parent workspaces); legacy `.pi/agents/{name}.md` is opt-in | Highest |

Use `agentScope` parameter to control discovery: `"user"`, `"project"`, or `"both"` (default; project takes priority).

<!-- {=subagentsProjectAgentStorageOverview} -->

Subagents stores project-scope agents and chains in shared pi storage by default under a
workspace-mirrored path, so repositories stay clean while still supporting parent-workspace lookup
for nested projects. Legacy repo-local `.pi/agents/` storage remains available as an explicit
project-mode override.

<!-- {/subagentsProjectAgentStorageOverview} -->

**Builtin agents:** The extension ships with ready-to-use agents — `scout`, `planner`, `worker`, `reviewer`, `context-builder`, `researcher`, `artist`, `frontend-designer`, and `multimodal-summariser`. They load at lowest priority so any user or project agent with the same name overrides them. Builtin agents appear with a `[builtin]` badge in listings and cannot be modified through management actions (create a same-named user agent to override instead).

> **Note:** The `researcher` agent uses `web_search`, `fetch_content`, and `get_search_content` tools which require the [pi-web-access](https://github.com/nicobailon/pi-web-access) extension. Install it with `pi install npm:pi-web-access`.
>
> **Note:** `artist` and `multimodal-summariser` work best when the runtime can access the relevant media files directly. `artist` prioritizes production-ready SVG and concrete image briefs when raster generation is not available as a tool.

**Agent frontmatter:**

```yaml
---
name: scout
description: Fast codebase recon
tools: read, grep, find, ls, bash, mcp:chrome-devtools  # mcp: requires pi-mcp-adapter
extensions:                 # absent=all, empty=none, csv=allowlist
model: claude-haiku-4-5
thinking: high               # off, minimal, low, medium, high, xhigh
skill: safe-bash, chrome-devtools  # comma-separated skills to inject
output: context.md           # writes to {chain_dir}/context.md
defaultReads: context.md     # comma-separated files to read
defaultProgress: true        # maintain progress.md
interactive: true            # (parsed but not enforced in v1)
---

Your system prompt goes here (the markdown body after frontmatter).
```

The `thinking` field sets a default extended thinking level for the agent. At runtime it's appended as a `:level` suffix to the model string (e.g., `claude-sonnet-4-5:high`). If the model already has a thinking suffix (from a chain-clarify override), the agent's default is not double-applied.

**Extension sandboxing**

Use `extensions` in frontmatter to control which extensions a subagent can access:

```yaml
# Field absent: all extensions load (default behavior)

# Empty field: no extensions
extensions:

# Allowlist specific extensions
extensions: /abs/path/to/ext-a.ts, /abs/path/to/ext-b.ts
```

Semantics:
- `extensions` absent → all extensions load
- `extensions:` empty → `--no-extensions`
- `extensions: a,b` → `--no-extensions --extension a --extension b`

When `extensions` is present, it takes precedence over extension paths implied by `tools` entries.

**MCP Tools**

Agents can use MCP server tools directly (requires the [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) extension). Add `mcp:` prefixed entries to the `tools` field:

```yaml
# All tools from a server
tools: read, bash, mcp:chrome-devtools

# Specific tools from a server
tools: read, bash, mcp:github/search_repositories, mcp:github/get_file_contents
```

| Syntax | Effect |
|--------|--------|
| `mcp:server-name` | All tools from that MCP server |
| `mcp:server-name/tool_name` | One specific tool |

The `mcp:` items are additive — they don't affect which builtins the agent gets. `tools: mcp:chrome-devtools` (with no regular tools listed) gives the agent all default builtins plus chrome-devtools tools. To restrict builtins, list them explicitly: `tools: read, bash, mcp:chrome-devtools`.

Subagents only get direct MCP tools when `mcp:` items are explicitly listed. Even if your `mcp.json` has `directTools: true` globally, a subagent without `mcp:` in its frontmatter won't get any direct tools — keeping it lean. The `mcp` proxy tool is still available for discovery if needed.

The MCP adapter's metadata cache must be populated for direct tools to work. On the first session with a new MCP server, tools will only be available through the `mcp` proxy. Restart Pi after the first session and direct tools become available.

**Resolution priority:** step override > agent frontmatter > disabled

## Quick Commands

| Command | Description |
|---------|-------------|
| `/run <agent> <task>` | Run a single agent with a task |
| `/chain agent1 "task1" -> agent2 "task2"` | Run agents in sequence with per-step tasks |
| `/parallel agent1 "task1" -> agent2 "task2"` | Run agents in parallel with per-step tasks |
| `/agents` | Open the Agents Manager overlay |

All commands validate agent names locally and tab-complete them, then route through the tool framework for full live progress rendering. Results are sent to the conversation for the LLM to discuss.

### Per-Step Tasks

Use `->` to separate steps and give each step its own task with quotes or `--`:

```
/chain scout "scan the codebase" -> planner "create implementation plan"
/parallel scanner "find security issues" -> reviewer "check code style"
```

Both double and single quotes work. The `--` delimiter also works: `/chain scout -- scan code -> planner -- analyze auth`.

Steps without a task inherit behavior from the execution mode: chain steps get `{previous}` (output from the prior step), parallel steps get the first available task as a fallback.

```
/chain scout "analyze auth" -> planner -> implementer
# scout: "analyze auth", planner: gets scout's output, implementer: gets planner's output
```

**Shared task (no `->`):** Space-separated agents with a single `--` task:

```
/chain scout planner -- analyze the auth system
/parallel scout reviewer -- check for security issues
```

### Inline Per-Step Config

Append `[key=value,...]` to any agent name to override its defaults:

```
/chain scout[output=context.md] "scan code" -> planner[reads=context.md] "analyze auth"
/run scout[model=anthropic/claude-sonnet-4] summarize this codebase
/parallel scanner[output=scan.md] "find issues" -> reviewer[output=review.md] "check style"
```

| Key | Example | Description |
|-----|---------|-------------|
| `output` | `output=context.md` | Write results to file (relative to chain dir for `/chain`/`/parallel`; for `/run`, absolute paths are used as-is and relative paths resolve against cwd) |
| `reads` | `reads=a.md+b.md` | Read files before executing (`+` separates multiple) |
| `model` | `model=anthropic/claude-sonnet-4` | Override model for this step |
| `skills` | `skills=planning+review` | Override skills (`+` separates multiple) |
| `progress` | `progress` | Enable progress tracking |

Set `output=false`, `reads=false`, or `skills=false` to explicitly disable.

### Background Execution

Add `--bg` at the end of any slash command to run in the background:

```
/run scout "full security audit of the codebase" --bg
/chain scout "analyze auth system" -> planner "design refactor plan" -> worker --bg
/parallel scout "scan frontend" -> scout "scan backend" -> scout "scan infra" --bg
```

Background tasks run asynchronously and notify you when complete. Check status with `subagent_status`.

## Agents Manager

Press **Ctrl+Shift+A** or type `/agents` to open the Agents Manager overlay — a TUI for browsing, viewing, editing, creating, and launching agents and chains.

**Screens:**

| Screen | Description |
|--------|-------------|
| List | Browse all agents and chains with search/filter, scope badges, chain badges |
| Detail | View resolved prompt, frontmatter fields, recent run history |
| Edit | Edit fields with specialized pickers (model, thinking, skills, prompt editor) |
| Chain Detail | View chain steps with flow visualization and dependency map |
| Parallel Builder | Build parallel execution slots, add same agent multiple times, per-slot task overrides |
| Task Input | Enter task and launch with optional skip-clarify toggle |
| New Agent | Create from templates (Blank, Scout, Planner, Implementer, Code Reviewer, Blank Chain) |

**List screen keybindings:**
- `↑↓` — navigate agents/chains
- `Enter` — view detail
- Type any character — search/filter
- `Tab` — toggle selection (agents only)
- `Ctrl+N` — new agent from template
- `Ctrl+K` — clone current item
- `Ctrl+D` or `Del` — delete current item
- `Ctrl+R` — run selected (1 agent: launch, 2+: sequential chain)
- `Ctrl+P` — open parallel builder (from selection or cursor agent)
- `Esc` — clear query, then selection, then close overlay

**Parallel builder keybindings:**
- `↑↓` — navigate slots
- `Ctrl+A` — add agent (opens search picker)
- `Del` or `Ctrl+D` — remove slot
- `Enter` — edit per-slot task override
- `Ctrl+R` — continue to task input (requires 2+ slots)
- `Esc` — back to list

**Task input keybindings:**
- `Enter` — launch (or quick run if skip-clarify is on)
- `Tab` — toggle skip-clarify (defaults to on for all manager launches)
- `Esc` — back

**Multi-select workflow:** Select agents with `Tab`, then press `Ctrl+R` for a sequential chain or `Ctrl+P` to open the parallel builder. The parallel builder lets you add the same agent multiple times, set per-slot task overrides, and launch N agents in parallel. Slots without a custom task use the shared task entered on the next screen.

## Chain Files

Chains are `.chain.md` files stored alongside agent files. They define reusable multi-step pipelines.

**Chain file locations:**

| Scope | Path |
|-------|------|
| User | `~/.pi/agent/agents/{name}.chain.md` |
| Project | `~/.pi/agent/subagents/project-agents/<mirrored-workspace>/agents/{name}.chain.md` |

**Format:**

```markdown
---
name: scout-planner
description: Gather context then plan implementation
---

## scout
output: context.md

Analyze the codebase for {task}

## planner
reads: context.md
model: anthropic/claude-sonnet-4-5:high
progress: true

Create an implementation plan based on {previous}
```

Each `## agent-name` section defines a step. Config lines (`output`, `reads`, `model`, `skills`, `progress`) go immediately after the header. A blank line separates config from the task text. Chains support the same three-state semantics as tool params: omitted (inherit from agent), value (override), `false` (disable).

Chains can be created from the Agents Manager template picker ("Blank Chain"), or saved from the chain-clarify TUI during execution.

## Features (beyond base)

- **Slash Commands**: `/run`, `/chain`, `/parallel` with tab-completion and live progress
- **Agents Manager Overlay**: Browse, view, edit, create, delete, and launch agents/chains from a TUI (`Ctrl+Shift+A`)
- **Management Actions**: LLM can list, inspect, create, update, and delete agent/chain definitions via `action` field
- **Chain Files**: Reusable `.chain.md` files with per-step config, saveable from the clarify TUI
- **Multi-select & Parallel**: Select agents in the overlay, launch as chain or parallel
- **Run History**: Per-agent JSONL recording of task, exit code, duration; shown on detail screen
- **Thinking Level**: First-class `thinking` frontmatter field with picker UI and runtime suffix application
- **Agent Templates**: Create agents from presets (Scout, Planner, Implementer, Code Reviewer, Blank Chain)
- **Skill Injection**: Agents declare skills in frontmatter; skills get injected into system prompts
- **Parallel-in-Chain**: Fan-out/fan-in patterns with `{ parallel: [...] }` steps within chains
- **Chain Clarification TUI**: Interactive preview/edit of chain templates and behaviors before execution
- **Agent Frontmatter Extensions**: Agents declare default chain behavior (`output`, `defaultReads`, `defaultProgress`, `skill`)
- **Chain Artifacts**: Shared directory at `<tmpdir>/pi-chain-runs/{runId}/` for inter-step files
- **Solo Agent Output**: Agents with `output` write to temp dir and return path to caller
- **Live Progress Display**: Real-time visibility during sync execution showing current tool, recent output, tokens, and duration
- **Output Truncation**: Configurable byte/line limits via `maxOutput`
- **Debug Artifacts**: Input/output/JSONL/metadata files per task
- **Session Logs**: JSONL session files with paths shown in output
- **Async Status Files**: Durable `status.json`, `events.jsonl`, and markdown logs for async runs
- **Async Widget**: Lightweight TUI widget shows background run progress
- **Session-scoped Notifications**: Async completions only notify the originating session

## Modes

| Mode | Async Support | Notes |
|------|---------------|-------|
| Single | Yes | `{ agent, task }` - agents with `output` write to temp dir |
| Chain | Yes | `{ chain: [{agent, task}...] }` with `{task}`, `{previous}`, `{chain_dir}` variables |
| Parallel | Yes | `{ tasks: [{agent, task}...] }` - via TUI toggle or converted to chain for async |

All modes support background/async execution. For programmatic async, use `clarify: false, async: true`. For interactive async, use `clarify: true` and press `b` in the TUI to toggle background mode before running. Chains with parallel steps (`{ parallel: [...] }`) run concurrently with configurable `concurrency` and `failFast` options.

**Clarify TUI for single/parallel:**

Single and parallel modes also support the clarify TUI for previewing/editing parameters before execution. Unlike chains, they default to no TUI - use `clarify: true` to enable:

```typescript
// Single agent with clarify TUI
{ agent: "scout", task: "Analyze the codebase", clarify: true }

// Parallel tasks with clarify TUI
{ tasks: [{agent: "scout", task: "Analyze frontend"}, ...], clarify: true }
```

**Clarification TUI keybindings:**

*Navigation mode:*
- `Enter` - Run (foreground) or launch in background if `b` is toggled on
- `Esc` - Cancel
- `↑↓` - Navigate between steps/tasks (parallel, chain)
- `e` - Edit task/template (all modes)
- `m` - Select model (all modes)
- `t` - Select thinking level (all modes)
- `s` - Select skills (all modes)
- `b` - Toggle background/async execution (all modes) — shows `[b]g:ON` when enabled
- `w` - Edit writes/output file (single, chain only)
- `r` - Edit reads list (chain only)
- `p` - Toggle progress tracking (chain only)
- `S` - Save current overrides to agent's frontmatter file (all modes)
- `W` - Save chain configuration to a `.chain.md` file (chain only)

*Model selector mode:*
- `↑↓` - Navigate model list
- `Enter` - Select model
- `Esc` - Cancel (keep current model)
- Type to filter (fuzzy search by model name or provider)

*Thinking level selector mode:*
- `↑↓` - Navigate level list
- `Enter` - Select level
- `Esc` - Cancel (keep current level)

*Skill selector mode:*
- `↑↓` - Navigate skill list
- `Space` - Toggle skill selection
- `Enter` - Confirm selection
- `Esc` - Cancel (keep current skills)
- Type to filter (fuzzy search by name or description)

*Edit mode (full-screen editor with word wrapping):*
- `Esc` - Save changes and exit
- `Ctrl+C` - Discard changes and exit
- `←→` - Move cursor left/right
- `Alt+←→` - Move cursor by word
- `↑↓` - Move cursor up/down by display line (auto-scrolls)
- `Page Up/Down` or `Shift+↑↓` - Move cursor by viewport (12 lines)
- `Home/End` - Start/end of current display line
- `Ctrl+Home/End` - Start/end of text
- `Alt+Backspace` - Delete word backward
- Paste supported (multi-line in multi-line editors)

## Skills

Skills are specialized instructions loaded from SKILL.md files and injected into the agent's system prompt.

**Skill locations (project-first precedence):**
- Project: `.pi/skills/{name}/SKILL.md`
- Project packages: `.pi/npm/node_modules/*` via `package.json -> pi.skills`
- Project settings: `.pi/settings.json -> skills`
- User: `~/.pi/agent/skills/{name}/SKILL.md`
- User packages: `~/.pi/agent/npm/node_modules/*` via `package.json -> pi.skills`
- User settings: `~/.pi/agent/settings.json -> skills`

**Usage:**
```typescript
// Agent with skills from frontmatter
{ agent: "scout", task: "..." }  // uses agent's default skills

// Override skills at runtime
{ agent: "scout", task: "...", skill: "tmux, safe-bash" }

// Disable all skills (including agent defaults)
{ agent: "scout", task: "...", skill: false }

// Chain with chain-level skills (additive to agent skills)
{ chain: [...], skill: "code-review" }

// Chain step with skill override
{ chain: [
  { agent: "scout", skill: "safe-bash" },  // only safe-bash
  { agent: "worker", skill: false }        // no skills at all
]}
```

**Skill injection format:**
```xml
<skill name="safe-bash">
[skill content from SKILL.md, frontmatter stripped]
</skill>
```

**Missing skills:** If a skill cannot be found, execution continues with a warning shown in the result summary.

## Usage

**subagent tool:**
```typescript
// Single agent
{ agent: "worker", task: "refactor auth" }
{ agent: "scout", task: "find todos", maxOutput: { lines: 1000 } }
{ agent: "scout", task: "investigate", output: false }  // disable file output

// Parallel (sync only)
{ tasks: [{ agent: "scout", task: "a" }, { agent: "scout", task: "b" }] }

// Chain with TUI clarification (default)
{ chain: [
  { agent: "scout", task: "Gather context for auth refactor" },
  { agent: "planner" },  // task defaults to {previous}
  { agent: "worker" },   // uses agent defaults for reads/progress
  { agent: "reviewer" }
]}

// Chain without TUI (enables async)
{ chain: [...], clarify: false, async: true }

// Chain with behavior overrides
{ chain: [
  { agent: "scout", task: "find issues", output: false },  // text-only, no file
  { agent: "worker", progress: false }  // disable progress tracking
]}

// Chain with parallel step (fan-out/fan-in)
{ chain: [
  { agent: "scout", task: "Gather context for the codebase" },
  { parallel: [
    { agent: "worker", task: "Implement auth based on {previous}" },
    { agent: "worker", task: "Implement API based on {previous}" }
  ]},
  { agent: "reviewer", task: "Review all changes from {previous}" }
]}

// Parallel step with options
{ chain: [
  { agent: "scout", task: "Find all modules" },
  { parallel: [
    { agent: "worker", task: "Refactor module A" },
    { agent: "worker", task: "Refactor module B" },
    { agent: "worker", task: "Refactor module C" }
  ], concurrency: 2, failFast: true }  // limit concurrency, stop on first failure
]}

// Async chain with parallel step (runs in background)
{ chain: [
  { agent: "scout", task: "Gather context" },
  { parallel: [
    { agent: "worker", task: "Implement feature A based on {previous}" },
    { agent: "worker", task: "Implement feature B based on {previous}" }
  ]},
  { agent: "reviewer", task: "Review all changes from {previous}" }
], clarify: false, async: true }
```

**subagent_status tool:**
```typescript
{ id: "a53ebe46" }
{ dir: "<tmpdir>/pi-async-subagent-runs/a53ebe46-..." }
```

## Management Actions

Agent definitions are not loaded into LLM context by default. Management actions let the LLM discover, inspect, create, and modify agent and chain definitions at runtime through the `subagent` tool — no manual file editing or restart required. Newly created agents are immediately usable in the same session. Set `action` and omit execution payloads (`task`, `chain`, `tasks`).

```typescript
// Discover all agents and chains (management defaults to both scopes)
{ action: "list" }
{ action: "list", agentScope: "project" }

// Inspect one agent or chain (searches both scopes)
{ action: "get", agent: "scout" }
{ action: "get", chainName: "review-pipeline" }

// Create agent
{ action: "create", config: {
  name: "Code Scout",
  description: "Scans codebases for patterns and issues",
  scope: "user",
  systemPrompt: "You are a code scout...",
  model: "anthropic/claude-sonnet-4",
  tools: "read, bash, mcp:github/search_repositories",
  extensions: "", // empty = no extensions
  skills: "parallel-scout",
  thinking: "high",
  output: "context.md",
  reads: "shared-context.md",
  progress: true
}}

// Create chain (presence of steps creates .chain.md)
{ action: "create", config: {
  name: "review-pipeline",
  description: "Scout then review",
  scope: "project",
  steps: [
    { agent: "scout", task: "Scan {task}", output: "context.md" },
    { agent: "reviewer", task: "Review {previous}", reads: ["context.md"] }
  ]
}}

// Update agent fields (merge semantics)
{ action: "update", agent: "scout", config: { model: "openai/gpt-4o" } }
{ action: "update", agent: "scout", config: { output: false, skills: "" } } // clear optional fields
{ action: "update", chainName: "review-pipeline", config: {
  steps: [
    { agent: "scout", task: "Scan {task}", output: "context.md" },
    { agent: "reviewer", task: "Improved review of {previous}", reads: ["context.md"] }
  ]
}}

// Delete definitions
{ action: "delete", agent: "scout" }
{ action: "delete", chainName: "review-pipeline" }
```

Notes:
- `create` uses `config.scope` (`"user"` or `"project"`), not `agentScope`.
- `update`/`delete` use `agentScope` only for scope disambiguation when the same name exists in both scopes.
- Agent config mapping: `reads -> defaultReads`, `progress -> defaultProgress`, `extensions` controls extension sandboxing, and `tools` supports `mcp:` entries that map to direct MCP tools.
- To clear any optional field, set it to `false` or `""` (e.g., `{ model: false }` or `{ skills: "" }`). Both work for all string-typed fields.

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `agent` | string | - | Agent name (single mode) or target for management get/update/delete |
| `task` | string | - | Task string (single mode) |
| `action` | string | - | Management action: `list`, `get`, `create`, `update`, `delete` |
| `chainName` | string | - | Chain name for management get/update/delete |
| `config` | object | - | Agent or chain config for management create/update |
| `output` | `string \| false` | agent default | Override output file for single agent (absolute path as-is, relative path resolved against cwd) |
| `skill` | `string \| string[] \| false` | agent default | Override skills (comma-separated string, array, or false to disable) |
| `model` | string | agent default | Override model for single agent |
| `tasks` | `{agent, task, cwd?, skill?}[]` | - | Parallel tasks (sync only) |
| `chain` | ChainItem[] | - | Sequential steps with behavior overrides (see below) |
| `chainDir` | string | `<tmpdir>/pi-chain-runs/` | Persistent directory for chain artifacts (default auto-cleaned after 24h) |
| `clarify` | boolean | true (chains) | Show TUI to preview/edit chain; implies sync mode |
| `agentScope` | `"user" \| "project" \| "both"` | `both` | Agent discovery scope (project wins on name collisions) |
| `async` | boolean | false | Background execution (requires `clarify: false` for chains) |
| `cwd` | string | - | Override working directory |
| `maxOutput` | `{bytes?, lines?}` | 200KB, 5000 lines | Truncation limits for final output |
| `artifacts` | boolean | true | Write debug artifacts |
| `includeProgress` | boolean | false | Include full progress in result |
| `share` | boolean | false | Upload session to GitHub Gist (see [Session Sharing](#session-sharing)) |
| `sessionDir` | string | - | Override session log directory (takes precedence over `defaultSessionDir` and parent-session-derived path) |

**ChainItem** can be either a sequential step or a parallel step:

*Sequential step fields:*

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `agent` | string | required | Agent name |
| `task` | string | `{task}` or `{previous}` | Task template (required for first step) |
| `cwd` | string | - | Override working directory |
| `output` | `string \| false` | agent default | Override output filename or disable |
| `reads` | `string[] \| false` | agent default | Override files to read from chain dir |
| `progress` | boolean | agent default | Override progress.md tracking |
| `skill` | `string \| string[] \| false` | agent default | Override skills or disable all |
| `model` | string | agent default | Override model for this step |

*Parallel step fields:*

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `parallel` | ParallelTask[] | required | Array of tasks to run concurrently |
| `concurrency` | number | 4 | Max concurrent tasks |
| `failFast` | boolean | false | Stop remaining tasks on first failure |

*ParallelTask fields:* (same as sequential step)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `agent` | string | required | Agent name |
| `task` | string | `{previous}` | Task template |
| `cwd` | string | - | Override working directory |
| `output` | `string \| false` | agent default | Override output (namespaced to parallel-N/M-agent/) |
| `reads` | `string[] \| false` | agent default | Override files to read |
| `progress` | boolean | agent default | Override progress tracking |
| `skill` | `string \| string[] \| false` | agent default | Override skills or disable all |
| `model` | string | agent default | Override model for this task |

Status tool:

| Tool | Description |
|------|-------------|
| `subagent_status` | Inspect async run status by id or dir |

## Chain Variables

Templates support three variables:

| Variable | Description |
|----------|-------------|
| `{task}` | Original task from first step (use in subsequent steps) |
| `{previous}` | Output from prior step (or aggregated outputs from parallel step) |
| `{chain_dir}` | Path to chain artifacts directory |

**Parallel output aggregation:** When a parallel step completes, all outputs are concatenated with clear separators:

```
=== Parallel Task 1 (worker) ===
[output from first task]

=== Parallel Task 2 (worker) ===
[output from second task]
```

This aggregated output becomes `{previous}` for the next step.

## Extension Configuration

`@ifi/pi-extension-subagents` reads optional JSON config from `~/.pi/agent/extensions/subagent/config.json`.

### `defaultSessionDir`

`defaultSessionDir` sets the fallback directory used for session logs. Eg:

```json
{
  "defaultSessionDir": "~/.pi/agent/sessions/subagent/"
}
```

Session root resolution follows this precedence:
1. `params.sessionDir` from the `subagent` tool call
2. `config.defaultSessionDir`
3. Derived from parent session (stored alongside parent session file)

Sessions are always enabled — every subagent run gets a session directory for tracking.

### `projectAgentStorageMode`

<!-- {=subagentsResolveProjectAgentStorageOptionsDocs} -->

Resolve the effective project-agent storage mode and shared root. Explicit options take precedence,
then environment variables, then extension config, and shared storage is the default when no
override is provided.

<!-- {/subagentsResolveProjectAgentStorageOptionsDocs} -->

```json
{
  "projectAgentStorageMode": "shared"
}
```

<!-- {=subagentsProjectAgentStorageOverview} -->

Subagents stores project-scope agents and chains in shared pi storage by default under a
workspace-mirrored path, so repositories stay clean while still supporting parent-workspace lookup
for nested projects. Legacy repo-local `.pi/agents/` storage remains available as an explicit
project-mode override.

<!-- {/subagentsProjectAgentStorageOverview} -->

<!-- {=subagentsMigrateLegacyProjectAgentsDocs} -->

Best-effort migration for legacy repo-local project agents. When shared mode is active, discovered
`.pi/agents/` directories are copied into shared storage and the empty legacy `.pi/` directory is
removed when possible.

<!-- {/subagentsMigrateLegacyProjectAgentsDocs} -->

### `projectAgentSharedRoot`

<!-- {=subagentsGetSharedProjectAgentsDirDocs} -->

Build the shared directory for project-scope agent and chain definitions. The path combines the
shared root, a mirrored workspace path, and the trailing `agents/` directory so different projects
stay isolated from one another.

<!-- {/subagentsGetSharedProjectAgentsDirDocs} -->

```json
{
  "projectAgentStorageMode": "shared",
  "projectAgentSharedRoot": "~/.pi/agent/subagents/project-agents"
}
```

<!-- {=subagentsFindNearestProjectAgentsDirDocs} -->

Find the highest-priority project agents directory for the current workspace. The resolver walks up
parent workspaces, migrates legacy storage when needed, and preserves the same nearest-parent lookup
semantics in both shared and project storage modes.

<!-- {/subagentsFindNearestProjectAgentsDirDocs} -->

Environment overrides are also supported:
- `PI_SUBAGENT_PROJECT_AGENTS_MODE=shared|project`
- `PI_SUBAGENT_PROJECT_AGENTS_ROOT=/custom/path`

## Chain Directory
Each chain run creates `<tmpdir>/pi-chain-runs/{runId}/` containing:
- `context.md` - Scout/context-builder output
- `plan.md` - Planner output
- `progress.md` - Worker/reviewer shared progress
- `parallel-{stepIndex}/` - Subdirectories for parallel step outputs
  - `0-{agent}/output.md` - First parallel task output
  - `1-{agent}/output.md` - Second parallel task output
- Additional files as written by agents

Directories older than 24 hours are cleaned up on extension startup.

## Artifacts

Location: `{sessionDir}/subagent-artifacts/` or `<tmpdir>/pi-subagent-artifacts/`

Files per task:
- `{runId}_{agent}_input.md` - Task prompt
- `{runId}_{agent}_output.md` - Full output (untruncated)
- `{runId}_{agent}.jsonl` - Event stream (sync only)
- `{runId}_{agent}_meta.json` - Timing, usage, exit code

## Session Logs

Session files (JSONL) are stored under a per-run session directory. Directory selection follows the same precedence as session root resolution: explicit `sessionDir` > `config.defaultSessionDir` > parent-session-derived path. The session file path is shown in output.

## Session Sharing

When `share: true` is passed, the extension will:

1. Export the full session (all tool calls, file contents, outputs) to an HTML file
2. Upload it to a GitHub Gist using your `gh` CLI credentials
3. Return a shareable URL (`https://shittycodingagent.ai/session/?<gistId>`)

**This is disabled by default.** Session data may contain sensitive information like source code, file paths, environment variables, or credentials that appear in tool outputs.

To enable sharing for a specific run:
```typescript
{ agent: "scout", task: "...", share: true }
```

Requirements:
- GitHub CLI (`gh`) must be installed and authenticated (`gh auth login`)
- Gists are created as "secret" (unlisted but accessible to anyone with the URL)

## Live progress (sync mode)

During sync execution, the collapsed view shows real-time progress for single, chain, and parallel modes.

**Chains:**
- Header: `... chain 1/2 | 8 tools, 1.4k tok, 38s`
- Chain visualization with status: `✓scout → ●planner` (✓=done, ●=running, ○=pending, ✗=failed)
- Current tool: `> read: packages/tui/src/...`
- Recent output lines (last 2-3 lines)

**Parallel:**
- Header: `... parallel 2/4 | 12 tools, 2.1k tok, 15s`
- Per-task step cards showing status icon, agent name, model, tool count, and duration
- Current tool and recent output for each running task

Press **Ctrl+O** to expand the full streaming view with complete output per step.

> **Note:** Chain visualization (the `✓scout → ●planner` line) is only shown for sequential chains. Chains with parallel steps show per-step cards instead.

## Nested subagent recursion guard

Subagents can themselves call the `subagent` tool, which risks unbounded recursive spawning (slow, expensive, hard to observe). A depth guard prevents this.

By default nesting is limited to **2 levels**: `main session → subagent → sub-subagent`. Any deeper `subagent` calls are blocked and return an error with guidance to the calling agent.

Override the limit with `PI_SUBAGENT_MAX_DEPTH` **set before starting `pi`**:

```bash
export PI_SUBAGENT_MAX_DEPTH=3   # allow one more level (use with caution)
export PI_SUBAGENT_MAX_DEPTH=1   # only allow direct subagents, no nesting
export PI_SUBAGENT_MAX_DEPTH=0   # disable the subagent tool entirely
```

`PI_SUBAGENT_DEPTH` is an internal variable propagated automatically to child processes -- don't set it manually.

## Async observability

Async runs write a dedicated observability folder:

```
<tmpdir>/pi-async-subagent-runs/<id>/
  status.json
  events.jsonl
  subagent-log-<id>.md
```

`status.json` is the source of truth for async progress and powers the TUI widget. If you already use
`/status <id>` you can keep doing that; otherwise use:

```typescript
subagent_status({ id: "<id>" })
subagent_status({ dir: "<tmpdir>/pi-async-subagent-runs/<id>" })
```

## Events

Async events:
- `subagent:started`
- `subagent:complete`

`notify.ts` consumes `subagent:complete` as the canonical completion channel.

## Files

```
├── index.ts                      # Main extension, tool registration, overlay dispatch
├── agents.ts                     # Agent + chain discovery, frontmatter parsing
├── skills.ts                     # Skill resolution, caching, and discovery
├── settings.ts                   # Chain behavior resolution, templates, chain dir
├── chain-clarify.ts              # TUI for chain/single/parallel clarification
├── chain-execution.ts            # Chain orchestration (sequential + parallel)
├── chain-serializer.ts           # Parse/serialize .chain.md files
├── async-execution.ts            # Async/background execution support
├── execution.ts                  # Core runSync, applyThinkingSuffix
├── render.ts                     # TUI rendering (widget, tool result display)
├── artifacts.ts                  # Artifact management
├── formatters.ts                 # Output formatting utilities
├── schemas.ts                    # TypeBox parameter schemas
├── utils.ts                      # Shared utility functions (mapConcurrent, readStatus, etc.)
├── types.ts                      # Shared types and constants
├── subagent-runner.ts            # Async runner (detached process)
├── parallel-utils.ts             # Parallel execution utilities for async runner
├── pi-spawn.ts                   # Cross-platform pi CLI spawning
├── single-output.ts              # Solo agent output file handling
├── notify.ts                     # Async completion notifications
├── completion-dedupe.ts          # Completion deduplication for notifications
├── file-coalescer.ts             # Debounced file write coalescing
├── jsonl-writer.ts               # JSONL event stream writer
├── agent-manager.ts              # Overlay orchestrator, screen routing, CRUD
├── agent-manager-list.ts         # List screen (search, multi-select, progressive footer)
├── agent-manager-detail.ts       # Detail screen (resolved prompt, runs, fields)
├── agent-manager-edit.ts         # Edit screen (pickers, prompt editor)
├── agent-manager-parallel.ts     # Parallel builder screen (slot management, agent picker)
├── agent-manager-chain-detail.ts # Chain detail screen (flow visualization)
├── agent-management.ts           # Management action handlers (list, get, create, update, delete)
├── agent-serializer.ts           # Serialize agents to markdown frontmatter
├── agent-scope.ts                # Agent scope resolution utilities
├── agent-selection.ts            # Agent selection state management
├── agent-templates.ts            # Agent/chain creation templates
├── render-helpers.ts             # Shared pad/row/header/footer helpers
├── run-history.ts                # Per-agent run recording (JSONL)
└── text-editor.ts                # Shared text editor (word nav, paste)
```
