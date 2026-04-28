# @ifi/pi-diagnostics

Prompt-completion diagnostics for pi.

## Install

```bash
pi install npm:@ifi/pi-diagnostics
```

Or install the full default oh-pi bundle:

```bash
npx @ifi/oh-pi
```

## What it provides

This extension adds prompt-level completion timing so you can tell exactly:

- when a prompt started
- when the agent finished responding
- how long the full prompt took
- how long each assistant turn took on multi-turn runs

## Surfaces

- widget below the editor showing the active prompt or most recent completion
- session log entry after each prompt finishes with human-readable start/end timestamps
- expanded per-turn timing details for prompts that needed multiple assistant turns
- `/diagnostics [status|toggle|on|off]`
- `Ctrl+Shift+D` to toggle diagnostics on and off quickly

## Relationship to tool-metadata

`@ifi/pi-diagnostics` also exports shared timestamp and duration helpers used by `tool-metadata`, so prompt-level and tool-level timing stay consistent.

## Notes

This package ships raw `.ts` sources for pi to load directly.
