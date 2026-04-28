# @ifi/pi-plan

Planning mode extension for pi.

Built on top of the planning workflow from [`sids/pi-extensions/plan-md`](https://github.com/sids/pi-extensions/tree/main/plan-md) and adapted for oh-pi.

## Installation

```bash
pi install npm:@ifi/pi-plan
```

Or install it as part of the full oh-pi bundle:

```bash
npx @ifi/oh-pi
```

Or use the package installer directly:

```bash
npx @ifi/pi-plan
npx @ifi/pi-plan --local
```

To remove:

```bash
npx @ifi/pi-plan --remove
```

## What it does

- `/plan` starts planning when inactive and opens plan-mode actions when already active.
- `Alt+P` runs the same plan-mode toggle flow as `/plan` without sending `/plan` as chat text.
- Start location picker (shown when the session has branchable history):
  - `Empty branch`
  - `Current branch`
- If a session plan already exists with content, startup offers:
  - `Continue planning`
  - `Empty branch` / `Current branch` when branchable history is available
  - `Start fresh` when no branchable history is available
- `/plan` accepts an optional location argument:
  - file path → use that exact file as the plan file
  - directory path → create `<timestamp>-<sessionId>.plan.md` in that directory
- Shows a persistent banner while active with the active plan file path.
- Running `/plan` while active shows:
  - `Exit`
  - `Exit & summarize branch`
- Running `/plan <location>` while active moves the current plan file to the resolved location.
- Exiting plan mode prefills the editor only when the active plan file has content.
- After exit, a `Plan mode ended.` message is shown with the plan file and an expandable plan preview when available.

## Commands

- `/plan [location]`

## Tools in plan mode

Plan mode adds planning-specific tools only while active:

- `task_agents` — run isolated research tasks using the bundled subagent runtime (concurrency: 1-4)
- `steer_task_agent` — rerun one task from a previous `task_agents` run with extra guidance
- `request_user_input` — ask clarifying questions with optional choices and optional freeform answers
- `set_plan` — overwrite the active plan file with the complete latest plan text

When plan mode ends, these tools are removed again.

## Notes

- By default, plan mode uses one plan file per session in the same directory as the session file, replacing the session extension with `.plan.md`.
- `/plan [location]` can override the plan file path.
- Plan files are kept after exiting so planning can be resumed later.
- The default plan-mode prompt is stored in `packages/plan/prompts/PLAN.prompt.md`.
- You can override that prompt globally by creating `~/.pi/agent/PLAN.prompt.md`.
- If the override file is missing or blank, the bundled prompt is used.
