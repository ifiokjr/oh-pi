# `@ifi/pi-diagnostics`

> Prompt-completion timing for pi — know exactly how long each prompt took and why.

## Why use this?

When pi seems slow, you want to know where the time went:
- "Was the model slow to respond, or did the tools take forever?"
- "Did one turn dominate the total time?"
- "Was the 5-minute wait because of 5× 1-minute turns?"

Diagnostics answers these by showing start/end timestamps and per-turn breakdowns.

## Installation

```bash
pi install npm:@ifi/pi-diagnostics
```

> Installed by default with `npx @ifi/oh-pi`.

## What you see

### Widget (below the editor)

```
⏱ Prompt 1 | started 10:23:41 | finished 10:24:19 | 38s | 2 turns
```

Shows the active or most recently completed prompt with total duration and turn count.

### Session log entry (after each prompt)

```
Diagnostics:
  Prompt started at: 10:23:41
  Finished at:       10:24:19
  Total duration:    38.2s (2 turns)
    Turn 1: 21.4s
    Turn 2: 16.8s
```

### Per-turn breakdown (multi-turn prompts)

When a prompt needs multiple assistant turns, the log breaks down each turn's timing so you can see if the delay was in the model, the tools, or both.

## Commands

```text
/diagnostics              # Show current status
/diagnostics toggle       # Toggle on/off
/diagnostics on           # Enable diagnostics
/diagnostics off          # Disable diagnostics
```

## Shortcut

`Ctrl+Shift+D` — quick toggle without typing a command.

## How it works

- Hooks into `before_agent_start`, `turn_end`, and `agent_end` pi events
- Tracks when the agent starts processing and when it finishes
- Reuses shared timestamp/duration formatting from `tool-metadata` for consistency
- Emits diagnostic messages when the agent goes idle after a prompt

## When to use it

- **Debugging slow prompts:** Turn on diagnostics, reproduce the slowness, check timestamps
- **Tuning tool usage:** See if long tool calls are causing delays
- **Cost analysis:** Correlate duration with cost from the usage tracker

## Relationship to tool-metadata

`@ifi/pi-diagnostics` and `tool-metadata` share timestamp helpers, keeping prompt-level and tool-level timing displays consistent. Diagnostics operates at the prompt level (start-to-finish), while tool-metadata operates at the individual tool-call level.

## Notes

- Ships raw TypeScript — no build step needed
- Disable via `/diagnostics off` or `Ctrl+Shift+D` if you prefer a cleaner UI
