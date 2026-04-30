# `@ifi/pi-plan`

> Structured planning mode for pi — think before you code.

## Why use this?

Direct implementation works for small tasks, but complex features benefit from planning first:

- **Avoid rework:** Plan the architecture before writing code
- **Capture decisions:** The plan file documents _why_ you made certain choices
- **Resume later:** Planning state persists across sessions

Plan mode turns planning into a first-class pi workflow with its own tools, banners, and file management.

## What planning feels like

```
/plan

┌─ Start Plan Mode ──────────────────────────┐
│                                             │
│  Empty branch    Start a new planning       │
│                  branch from scratch        │
│                                             │
│  Current branch  Continue from where the    │
│                  conversation left off      │
│                                             │
└─────────────────────────────────────────────┘
```

While active, a banner stays visible:

```
┌ PLAN MODE ─ /home/user/projects/app/session-abc.plan.md ─────┐
│ [plan-mode tools are active: task_agents, request_user_input] │
└───────────────────────────────────────────────────────────────┘
```

Exiting plan mode shows a summary:

```
Plan mode ended.
Plan saved to: /home/user/projects/app/session-abc.plan.md
```

## Installation

```bash
pi install npm:@ifi/pi-plan
```

> Installed by default with `npx @ifi/oh-pi`.

## Commands

| Command             | Action                                              |
| ------------------- | --------------------------------------------------- |
| `/plan`             | Enter plan mode (or show actions if already active) |
| `/plan [file-path]` | Use a specific file as the plan file                |
| `/plan [directory]` | Create a timestamped plan file in that directory    |

## Shortcut

`Alt+P` — toggle plan mode without typing `/plan`.

## Tools available in plan mode

Only while plan mode is active, these tools are exposed:

| Tool                 | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `task_agents`        | Run parallel research tasks (1-4 concurrent subagents) |
| `steer_task_agent`   | Rerun a specific research task with extra guidance     |
| `request_user_input` | Ask you clarifying questions with optional choices     |
| `set_plan`           | Overwrite the plan file with the latest full plan text |

When plan mode ends, these tools disappear.

## Plan mode vs. subagent planner

|                 | Plan mode (`/plan`)                 | Subagent planner                         |
| --------------- | ----------------------------------- | ---------------------------------------- |
| **Scope**       | Interactive session state           | Isolated subagent run                    |
| **Persistence** | Plan file on disk                   | Passed as text between steps             |
| **Tools**       | `task_agents`, `request_user_input` | Full agent tool access                   |
| **Best for**    | Architecting features interactively | Delegate a planning pass to a specialist |

## Customization

The default plan-mode prompt lives at `packages/plan/prompts/PLAN.prompt.md`. Override it globally by creating `~/.pi/agent/PLAN.prompt.md`. If the override file is missing or blank, the bundled prompt is used.

## Plan file management

- Default plan file: replaces the session extension with `.plan.md` in the session directory
- Plan files persist after exiting — resume later with `/plan`
- While active, `/plan <location>` moves the current plan file

## Notes

- Ships raw TypeScript — no build step needed
- Plan mode does not automatically trigger implementation — it's for thinking, not coding
