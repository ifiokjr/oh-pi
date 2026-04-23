# @ifi/pi-bash-live-view

PTY-backed live bash rendering for pi.

## Install

```bash
pi install npm:@ifi/pi-bash-live-view
```

## Why this exists

The built-in `bash` tool is great for batch output, but it does not preserve a terminal screen while a command is actively running. This package adds an opt-in PTY mode so commands that depend on terminal behavior can stream into a live widget and still return a normal tool result when they finish.

## What it provides

- `bash_live_view` tool with `usePTY?: boolean`
- live terminal widget while PTY commands run
- `@xterm/headless` terminal snapshots rendered back into ANSI lines
- `node-pty` session management with timeout, abort, and cleanup handling
- `/bash-pty <command>` slash command
- `user_bash` support for `!` and `!!` commands
- output truncation, exit summaries, and likely-error highlighting
- spawn-helper permission checks for bundled `node-pty` binaries

## Usage

### Agent tool call

```ts
await bash_live_view({
  command: "pnpm test --watch",
  timeout: 30,
  usePTY: true,
});
```

`usePTY` defaults to `false`, so `bash_live_view` can still delegate to pi's original built-in `bash` behavior when you don't need a PTY.

### Slash command

```text
/bash-pty pnpm dev
```

### User bash

```text
!htop
!!pnpm test --watch
```

## Notes

- the live widget only appears for PTY-backed commands
- elapsed time is shown as `MM:SS`
- PTY output is still truncated to keep tool results compact
- ANSI sanitization strips bell characters and limits CSI parameter payloads

This package ships raw `.ts` sources for pi to load directly.
