# Pi Coding Agent Documentation Index

> Based on `@mariozechner/pi-coding-agent` v0.52.12 official documentation Last updated: 2026-02-14

## Table of Contents

| #   | File                                                                   | Contents                                                                                       |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 01  | [Overview](01-overview.md)                                             | Project purpose, design philosophy, package architecture, install, run modes, providers, auth  |
| 02  | [Interactive Mode](02-interactive-mode.md)                             | UI layout, editor features, command system, keybindings, message queue, terminal compatibility |
| 03  | [Session Management](03-sessions.md)                                   | JSONL tree structure, entry types, branching/tree/fork, context compaction, branch summaries   |
| 04  | [Extension System](04-extensions.md)                                   | Extension API, event lifecycle, custom tools, UI interaction, state management, example index  |
| 05  | [Skills/Prompts/Themes/Packages](05-skills-prompts-themes-packages.md) | Skill packs, prompt templates, theme customization, package management and distribution        |
| 06  | [Settings/SDK/RPC/TUI](06-settings-sdk-rpc-tui.md)                     | All settings, SDK programming interface, RPC protocol, TUI component system, custom models     |
| 07  | [CLI Reference](07-cli-reference.md)                                   | Complete CLI options, directory structure, platform support, key numbers                       |

## Core Concepts Quick Reference

### What is Pi?

A minimalist terminal coding agent tool. Gives the LLM four tools by default (read/bash/edit/write)
and extends capabilities via Extensions, Skills, Prompt Templates, and Themes. Does not ship
built-in sub-agents, plan mode, MCP, or permission popups — all implemented through extensions.

### Four-Layer Extension Architecture

```
┌──────────────────────────────────────────────┐
│  Pi Packages — Bundled distribution (npm/git) │
│  ┌──────────────────────────────────────────┐ │
│  │  Extensions — TypeScript code plugins     │ │
│  │  • Custom tools, commands, shortcuts, UI  │ │
│  │  • Event interception, state, providers   │ │
│  ├──────────────────────────────────────────┤ │
│  │  Skills — On-demand capability packs      │ │
│  │  • SKILL.md + scripts/resources           │ │
│  │  • /skill:name invocation or auto-load    │ │
│  ├──────────────────────────────────────────┤ │
│  │  Prompt Templates — Reusable prompts      │ │
│  │  • .md files, /name to expand             │ │
│  │  • Positional params: $1 $2 $@            │ │
│  ├──────────────────────────────────────────┤ │
│  │  Themes — JSON color themes               │ │
│  │  • 51 color tokens, hot reload            │ │
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Run Modes

```
Interactive ← Full TUI (default)
Print       ← Single output (pi -p)
JSON        ← Event stream (pi --mode json)
RPC         ← stdin/stdout protocol (pi --mode rpc)
SDK         ← TypeScript import (createAgentSession)
```

### Session Tree Structure

```
SessionHeader (first line of file, metadata)
  └─ MessageEntry (id/parentId linked)
       ├─ user → assistant → toolResult → ...
       │    └─ [branch] user → assistant → ...
       ├─ CompactionEntry (compaction summary)
       ├─ BranchSummaryEntry (branch summary)
       ├─ ModelChangeEntry
       ├─ CustomEntry (extension state)
       └─ LabelEntry (bookmark)
```

### Configuration Priority

```
CLI flags > project .pi/settings.json > global ~/.pi/agent/settings.json
```

### API Key Resolution Priority

```
--api-key > auth.json > environment variables > models.json
```

## Value for oh-pi

This documentation provides the knowledge base for oh-pi (one-click pi-coding-agent configuration):

1. **Full settings reference** — All settings.json fields, enabling interactive configuration
2. **Directory structure** — Every file under `~/.pi/agent/` and `.pi/` explained
3. **Extension system** — Install, configure, and generate extensions for users
4. **Skills/Prompts/Themes** — Discovery, installation, and configuration
5. **Package management** — `pi install/remove/list/update/config` full usage
6. **Provider auth** — All provider API key env vars and auth.json format
7. **Custom models** — models.json format for Ollama/vLLM/etc configuration
8. **Keybindings** — All actions and default bindings for keybindings.json generation
9. **Themes** — 51 color tokens for custom theme generation

## Original Documentation Location

```
~/.local/share/fnm/node-versions/v24.9.0/installation/lib/node_modules/@mariozechner/pi-coding-agent/
├── README.md                    # Main docs
├── docs/
│   ├── compaction.md            # Compaction mechanism
│   ├── custom-provider.md       # Custom providers
│   ├── development.md           # Development guide
│   ├── extensions.md            # Extension system (largest, 63KB)
│   ├── json.md                  # JSON event stream mode
│   ├── keybindings.md           # Keybindings
│   ├── models.md                # Custom models
│   ├── packages.md              # Package management
│   ├── prompt-templates.md      # Prompt templates
│   ├── providers.md             # Provider configuration
│   ├── rpc.md                   # RPC protocol (32KB)
│   ├── sdk.md                   # SDK interface (28KB)
│   ├── session.md               # Session format
│   ├── settings.md              # Settings
│   ├── shell-aliases.md         # Shell aliases
│   ├── skills.md                # Skill packs
│   ├── terminal-setup.md        # Terminal setup
│   ├── termux.md                # Android Termux
│   ├── themes.md                # Themes
│   ├── tree.md                  # Tree navigation
│   ├── tui.md                   # TUI components (28KB)
│   └── windows.md               # Windows setup
└── examples/
    ├── extensions/              # 60+ extension examples
    │   ├── hello.ts             # Minimal example
    │   ├── subagent/            # Sub-agent system
    │   ├── plan-mode/           # Plan mode
    │   ├── custom-provider-*/   # Custom providers
    │   └── ...
    └── sdk/                     # 12 SDK examples
        ├── 01-minimal.ts
        ├── ...
        └── 12-full-control.ts
```
