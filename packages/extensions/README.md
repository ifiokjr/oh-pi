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
