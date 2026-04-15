# @ifi/oh-pi-extensions

Core first-party extensions for pi.

## Included extensions

This package includes extensions such as:
- adaptive-routing / route
- safe-guard
- git-guard
- auto-session-name
- custom-footer
- compact-header
- external-editor / /external-editor
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
usage monitoring, adaptive model routing, scheduling features, external-editor integration, and runtime performance protection (`/watchdog`, `/safe-mode`) to pi.

`git-guard` also blocks git bash invocations that are likely to open an interactive editor in agent environments (for example `git rebase --continue` without non-interactive editor overrides), preventing hangs before they happen.

## External editor

The `external-editor` extension adds:

- `/external-editor` — open the current draft in `$VISUAL` or `$EDITOR`
- `/external-editor status` — show the configured editor and available bindings
- `Ctrl+Shift+E` — open the current draft in the configured external editor

When the editor exits successfully, the updated text is synced back into pi's main draft editor.
This complements pi's built-in `app.editor.external` binding (`Ctrl+G` by default) with a
discoverable slash command and an extra shortcut.

## Adaptive routing

Adaptive routing adds a user-friendly `/route` command set and an opt-in model-agnostic mode that can:

- classify prompts with a cheap router model
- choose model and thinking level before a turn starts
- respect provider reserve thresholds and fallback groups
- suggest routes in shadow mode before automatically applying them
- persist local-only telemetry and feedback under shared pi storage

Key commands:

- `/route status`
- `/route shadow`
- `/route auto`
- `/route off`
- `/route explain`
- `/route lock`
- `/route unlock`
- `/route feedback <category>`
- `/route stats`

## Scheduler follow-ups

<!-- {=extensionsSchedulerOverview} -->

The scheduler extension adds recurring checks, one-time reminders, and the LLM-callable
`schedule_prompt` tool so pi can schedule future follow-ups like PR, CI, build, or deployment
checks. Tasks run only while pi is active and idle, and scheduler state is persisted in shared pi
storage using a workspace-mirrored path.

<!-- {/extensionsSchedulerOverview} -->

Use `continueUntilComplete: true` (plus optional `completionSignal`, `retryInterval`, and
`maxAttempts`) when a scheduled check should keep retrying until completion is detected.

## Package layout

```text
extensions/
```

Pi loads the raw TypeScript extensions from this directory.

## Scheduler ownership model

<!-- {=extensionsSchedulerOwnershipDocs} -->

The scheduler distinguishes between instance-scoped tasks and workspace-scoped tasks. Instance
scope is the default for `/loop`, `/remind`, and `schedule_prompt`, which means tasks stay owned by
one pi instance and other instances restore them for review instead of auto-running them.
Workspace scope is an explicit opt-in for shared CI/build/deploy monitors that should survive
instance changes in the same repository.

<!-- {/extensionsSchedulerOwnershipDocs} -->

When another live instance already owns scheduler activity for the workspace, pi prompts before taking over. You can also manage ownership explicitly with:

- `/schedule adopt <id|all>`
- `/schedule release <id|all>`
- `/schedule clear-foreign`

Use workspace scope sparingly for long-running shared checks like CI/build/deploy monitoring. For ordinary reminders and follow-ups, prefer the default instance scope.

## Usage tracker

<!-- {=extensionsUsageTrackerOverview} -->

The usage-tracker extension is a CodexBar-inspired provider quota and cost monitor for pi. It
shows provider-level rate limits for Anthropic, OpenAI, and Google using pi-managed auth, while
also tracking per-model token usage and session costs locally.

<!-- {/extensionsUsageTrackerOverview} -->

<!-- {=extensionsUsageTrackerPersistenceDocs} -->

Usage-tracker persists rolling 30-day cost history and the last known provider rate-limit snapshot
under the pi agent directory. That lets the widget and dashboard survive restarts and keep showing
recent subscription windows when a live provider probe is temporarily rate-limited or unavailable.

<!-- {/extensionsUsageTrackerPersistenceDocs} -->

<!-- {=extensionsUsageTrackerCommandsDocs} -->

Key usage-tracker surfaces:

- widget above the editor for at-a-glance quotas and session totals
- `/usage` for the full dashboard overlay
- `Ctrl+U` as a shortcut for the same overlay
- `/usage-toggle` to show or hide the widget
- `/usage-refresh` to force fresh provider probes
- `usage_report` so the agent can answer quota and spend questions directly

<!-- {/extensionsUsageTrackerCommandsDocs} -->

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

### Watchdog alert behavior

<!-- {=extensionsWatchdogAlertBehaviorDocs} -->

The watchdog samples CPU, memory, and event-loop lag on an interval, records recent samples and
alerts, and can escalate into safe mode automatically when repeated alerts indicate sustained UI
churn or lag. Toast notifications are intentionally capped per session; ongoing watchdog state is
kept visible in the status bar and the `/watchdog` overlay instead of repeatedly spamming the
terminal.

<!-- {/extensionsWatchdogAlertBehaviorDocs} -->

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

## Auto session naming and compaction continuity

`auto-session-name` now keeps session titles fresh as work focus changes, triggers a
`continue` follow-up after compaction, and emits a shutdown resume hint with the current
session id.
