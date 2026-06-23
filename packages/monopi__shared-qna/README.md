# `@monopi/shared-qna`

> Shared TUI Q&A helpers for pi extensions — one place for pi-tui loading logic.

## Why use this?

Multiple first-party monopi packages need the pi TUI library (`@earendil-works/pi-tui`). This package centralizes the loading strategy so each package doesn't duplicate the same fallback-resolution code.

If you're writing a pi extension that uses the TUI, depend on this package instead of importing `@earendil-works/pi-tui` directly — it handles resolution edge cases automatically.

## Installation

```bash
pnpm add @monopi/shared-qna
```

> This is a library consumed by other packages. Not installed as a standalone pi package.

## API

### `getPiTuiFallbackPaths(options?)`

Returns ordered Bun-global fallback paths for `@earendil-works/pi-tui`.

```ts
import { getPiTuiFallbackPaths } from "@monopi/shared-qna";

const paths = getPiTuiFallbackPaths();
// [
//   "~/.bun/install/global/node_modules/@earendil-works/pi-tui"
// ]
```

Prefers explicit `BUN_INSTALL` root when set, avoids duplicates.

### `requirePiTuiModule(options?)`

Loads `@earendil-works/pi-tui` with shared fallback strategy.

```ts
import { requirePiTuiModule } from "@monopi/shared-qna";

const piTui = await requirePiTuiModule();
// Returns the pi-tui module, trying normal resolution first,
// then Bun-global fallbacks, with helpful error if all fail.
```

## How it works

1. Try normal package resolution (`import "@earendil-works/pi-tui"`)
2. If that fails, walk Bun-global fallback paths
3. If all fail, throw error listing every checked location

## Related

- [`@earendil-works/pi-tui`](https://www.npmjs.com/package/@earendil-works/pi-tui) — the pi TUI library itself
- [`@monopi/extension-worktree`](../monopi__extension-worktree) — uses this for TUI-based widgets
