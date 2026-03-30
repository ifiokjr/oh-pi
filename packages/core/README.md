# @ifi/oh-pi-core

Shared types, registries, icons, and i18n helpers for oh-pi packages.

## What this package is for

`@ifi/oh-pi-core` is an internal library used by other packages in this monorepo. It provides
common building blocks for the CLI and other compiled packages.

## Typical consumers

- `@ifi/oh-pi-cli`
- other first-party oh-pi packages that need shared registries or presentation helpers

## Install

This package is primarily intended for internal monorepo use rather than direct end-user
installation.

## Development

```bash
pnpm --filter @ifi/oh-pi-core build
pnpm --filter @ifi/oh-pi-core typecheck
```

## Exports

The package publishes compiled output from `dist/` and exposes its public API through the package
root export.
