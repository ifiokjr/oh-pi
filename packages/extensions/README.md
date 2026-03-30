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
usage monitoring, and scheduling features to pi.

## Package layout

```text
extensions/
```

Pi loads the raw TypeScript extensions from this directory.

## Notes

This package ships raw `.ts` extensions for pi to load directly.
