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

## Scheduler follow-ups

<!-- {=extensionsSchedulerOverview} -->

The scheduler extension adds recurring checks, one-time reminders, and the LLM-callable
`schedule_prompt` tool so pi can schedule future follow-ups like PR, CI, build, or deployment
checks. Tasks run only while pi is active and idle, and scheduler state is persisted in shared pi
storage using a workspace-mirrored path.

<!-- {/extensionsSchedulerOverview} -->

## Package layout

```text
extensions/
```

Pi loads the raw TypeScript extensions from this directory.

## Watchdog config

<!-- {=extensionsWatchdogConfigOverview} -->

The watchdog extension reads optional runtime protection settings from a JSON config file in the pi
agent directory. That config controls whether sampling is enabled, how frequently samples run, and
which CPU, memory, and event-loop thresholds trigger alerts or safe-mode escalation.

<!-- {/extensionsWatchdogConfigOverview} -->

<!-- {=extensionsWatchdogConfigPathDocs} -->

Path to the optional watchdog JSON config file under the pi agent directory. This is the default
location used for watchdog sampling, threshold overrides, and enable/disable settings.

<!-- {/extensionsWatchdogConfigPathDocs} -->

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

### Watchdog helper behavior

<!-- {=extensionsLoadWatchdogConfigDocs} -->

Load watchdog config from disk and return a safe object. Missing files, invalid JSON, or malformed
values all fall back to an empty config so runtime monitoring can continue safely.

<!-- {/extensionsLoadWatchdogConfigDocs} -->

<!-- {=extensionsResolveWatchdogThresholdsDocs} -->

Resolve the effective watchdog thresholds by merging optional config overrides onto the built-in
default thresholds.

<!-- {/extensionsResolveWatchdogThresholdsDocs} -->

<!-- {=extensionsResolveWatchdogSampleIntervalMsDocs} -->

Resolve the watchdog sampling interval in milliseconds, clamping configured values into the
supported range and falling back to the default interval when no valid override is provided.

<!-- {/extensionsResolveWatchdogSampleIntervalMsDocs} -->

## Notes

This package ships raw `.ts` extensions for pi to load directly.
