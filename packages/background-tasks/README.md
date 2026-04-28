# @ifi/pi-background-tasks

Reactive background shell tasks for pi.

## Install

```bash
pi install npm:@ifi/pi-background-tasks
```

Or install the full default oh-pi bundle, which also includes the compatible `bg-process` shim:

```bash
npx @ifi/oh-pi
```

## What it provides

This package turns explicit background shell commands into a first-class pi workflow:

- ordinary `bash` commands stay in the foreground and use pi's built-in execution flow
- `bg_status` — compatibility tool for listing, tailing, and stopping tracked background tasks by PID
- `bg_task` — richer LLM-callable tool for spawning, listing, tailing, stopping, and clearing tasks by id or PID
- `/bg` — slash command for launching and managing background tasks manually
- `Ctrl+Shift+B` — richer multi-pane dashboard overlay with a task list, metadata pane, and scrollable log tail
- `/bg watch --follow <id>` — jump straight into the output pane for a task with follow-tail mode enabled
- reactive follow-ups — pi can wake itself up when watched tasks emit new output or exit
- persistent log files for every spawned task

## Example flows

```text
/bg run gh pr checks 123 --watch
/bg run pnpm test --watch
/bg watch bg-1
/bg watch --follow bg-1
/bg stop bg-1
```

The `bg_task` tool lets the agent start tasks explicitly and optionally gate wakeups with a substring or `/regex/flags` pattern.

The dashboard supports:

- `Tab` to switch between the task list and output pane
- `↑↓`, `Shift+↑`, `Shift+↓`, `Home`, and `End` for navigation
- `f` to toggle follow-tail mode
- `s` to stop the selected task
- `c` to clear finished tasks

## Notes

- tasks are tracked for the current pi runtime and cleaned up on session shutdown
- every task writes output to a log file so you can inspect recent activity even after the command returns
- use `bg_task` or `/bg` for servers, watchers, PR checks, and other commands you want to keep running after the tool returns
- `reactToOutput` defaults to `true`, so long-lived watchers like `gh ... --watch` can wake the agent when new output arrives

This package ships raw `.ts` sources for pi to load directly.
