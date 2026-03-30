# @ifi/oh-pi-extensions

Core first-party extensions for pi.

## Included extensions

This package includes extensions such as:
- safe-guard
- git-guard
- auto-session-name
- custom-footer
- compact-header
- auto-update
- bg-process
- usage-tracker
- scheduler
- btw / qq
- watchdog / safe-mode

## Install

```bash
pi install npm:@ifi/oh-pi-extensions
```

Or install the full bundle:

```bash
npx @ifi/oh-pi
```

## What it provides

These extensions add commands, tools, UI widgets, safety checks, background process handling,
usage monitoring, scheduling features, and runtime performance protection (`/watchdog`, `/safe-mode`) to pi.

## Package layout

```text
extensions/
```

Pi loads the raw TypeScript extensions from this directory.

## Scheduler ownership model

`scheduler` now distinguishes between **instance-scoped** tasks and **workspace-scoped** tasks:

- **Instance scope** is the default for `/loop`, `/remind`, and `schedule_prompt`.
  - The task stays owned by the pi instance that created it.
  - Opening a second pi instance in the same repo will **not** auto-run that task.
  - Foreign tasks are restored for review instead of being dispatched automatically.
- **Workspace scope** is opt-in for monitors that should survive instance changes in the same repo.
  - Use `/loop --workspace ...`
  - Use `/remind --workspace ...`
  - Or use `schedule_prompt(..., { scope: "workspace" })`

When another live instance already owns scheduler activity for the workspace, pi prompts before taking over. You can also manage ownership explicitly with:

- `/schedule adopt <id|all>`
- `/schedule release <id|all>`
- `/schedule clear-foreign`

Use workspace scope sparingly for long-running shared checks like CI/build/deploy monitoring. For ordinary reminders and follow-ups, prefer the default instance scope.

## Watchdog config

`watchdog` reads optional JSON config from:

```text
~/.pi/agent/extensions/watchdog/config.json
```

Example:

```json
{
  "enabled": true,
  "sampleIntervalMs": 5000,
  "thresholds": {
    "cpuPercent": 85,
    "rssMb": 1200,
    "heapUsedMb": 768,
    "eventLoopP99Ms": 120,
    "eventLoopMaxMs": 250
  }
}
```

## Notes

This package ships raw `.ts` extensions for pi to load directly.
