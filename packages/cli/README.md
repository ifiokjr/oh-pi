# @ifi/oh-pi-cli

Interactive TUI configurator for `pi-coding-agent`.

## What it does

`@ifi/oh-pi-cli` powers the interactive `oh-pi` setup experience. It helps configure:
- providers and auth
- models
- extensions
- prompts
- skills
- themes
- agent templates
- installer presets

## Usage

Run the CLI with:

```bash
npx @ifi/oh-pi-cli
```

Most users will want the meta-installer instead:

```bash
npx @ifi/oh-pi
```

## Package role

This is a compiled Node.js CLI package. It is part of the oh-pi monorepo and depends on the other
workspace packages for content and installation targets.

## Development

```bash
pnpm --filter @ifi/oh-pi-cli build
pnpm --filter @ifi/oh-pi-cli typecheck
```

## Related packages

- `@ifi/oh-pi` — one-command installer
- `@ifi/oh-pi-core` — shared registries and types
