# `@ifi/pi-shared-qna`

> Shared TUI Q&A helpers for pi extensions — one place for pi-tui loading logic.

## Why use this?

Multiple first-party oh-pi packages need the pi TUI library (`@mariozechner/pi-tui`). This package centralizes the loading strategy so each package doesn't duplicate the same fallback-resolution code.

If you're writing a pi extension that uses the TUI, depend on this package instead of importing `@mariozechner/pi-tui` directly — it handles resolution edge cases automatically.

## Installation

```bash
pnpm add @ifi/pi-shared-qna
```

> This is a library consumed by other packages. Not installed as a standalone pi package.

## API

### `getPiTuiFallbackPaths(options?)`

Returns ordered Bun-global fallback paths for `@mariozechner/pi-tui`.

```ts
import { getPiTuiFallbackPaths } from "@ifi/pi-shared-qna";

const paths = getPiTuiFallbackPaths();
// [
//   "~/.bun/install/global/node_modules/@mariozechner/pi-tui"
// ]
```

Prefers explicit `BUN_INSTALL` root when set, avoids duplicates.

### `requirePiTuiModule(options?)`

Loads `@mariozechner/pi-tui` with shared fallback strategy.

```ts
import { requirePiTuiModule } from "@ifi/pi-shared-qna";

const piTui = await requirePiTuiModule();
// Returns the pi-tui module, trying normal resolution first,
// then Bun-global fallbacks, with helpful error if all fail.
```

## How it works

1. Try normal package resolution (`import "@mariozechner/pi-tui"`)
2. If that fails, walk Bun-global fallback paths
3. If all fail, throw error listing every checked location

## Related

- [`@mariozechner/pi-tui`](https://www.npmjs.com/package/@mariozechner/pi-tui) — the pi TUI library itself
- [`@ifi/oh-pi-extensions`](../extensions) — uses this for TUI-based widgets
