# `@ifi/oh-pi-agents`

> AGENTS.md templates for pi — pre-built role profiles that set pi's behavior.

## Why use this?

An `AGENTS.md` file tells pi how to behave in your project. It defines coding conventions, workflow rules, and domain context. These templates give you proven starting points for common roles without writing from scratch.

## Templates

| Template | Focus | Best for |
| -------- | ----- | -------- |
| `general-developer` | Safe defaults | Everyday development, any project |
| `fullstack-developer` | Architecture + quality | Full-stack apps with frontend + backend |
| `security-researcher` | Security testing workflow | Security audits and vulnerability research |
| `data-ai-engineer` | Data + ML pipelines | Data engineering, AI/ML projects |

## Installation

These templates are consumed by `@ifi/oh-pi-cli` and the oh-pi installer. Most users should install the full bundle:

```bash
npx @ifi/oh-pi
```

The templates are not typically installed as a standalone pi package.

## Usage

The oh-pi CLI (`pnpm oh-pi-cli`) lets you pick a template during setup. The template is copied to your project as `AGENTS.md`, where pi reads it on startup.

To manually use a template:

1. Copy the relevant markdown file from `packages/agents/agents/<template>.md`
2. Paste it into `AGENTS.md` in your project root
3. Customize the sections to match your stack and preferences

## Package layout

```
agents/
├── general-developer.md
├── fullstack-developer.md
├── security-researcher.md
└── data-ai-engineer.md
```

Each file is a markdown template designed to be copied and customized.

## Related

- [`@ifi/oh-pi`](../oh-pi) — full installer bundle
- [`@ifi/oh-pi-cli`](../cli) — interactive TUI configurator that uses these templates
- [Pi AGENTS.md docs](https://github.com/badlogic/pi-mono) — how AGENTS.md works in pi
