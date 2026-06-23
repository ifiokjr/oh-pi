# @monopi/monopi

> All-in-one setup for pi-coding-agent — extensions, prompts, skills, themes, remote sharing, and dynamic subagent workflows.

## Install

```bash
npx @monopi/monopi
```

This registers all monopi packages with pi in one command. Each package is installed separately so pi can load extensions with proper module resolution.

### Options

```bash
npx @monopi/monopi                      # install latest versions (global)
npx @monopi/monopi --version 0.2.13     # pin to a specific version
npx @monopi/monopi --local              # install to project .pi/settings.json
npx @monopi/monopi --remove             # uninstall all monopi packages from pi
```

## Start Here

<!-- {=repoStartHerePathDocs} -->

Use this reading path depending on what you are trying to do:

- **I just want to use monopi** → start in the root `README.md`, then jump into `docs/feature-catalog.md` for package-by-package detail
- **I want to try the latest local changes** → run `pnpm install`, `pnpm pi:local`, restart `pi`, then exercise the feature in a real session
- **I want to contribute** → read `CONTRIBUTING.md`, then the package README for the area you are changing
- **I want to understand ownership** → use `docs/feature-catalog.md` to see which package owns which runtime feature, content pack, or library surface

<!-- {/repoStartHerePathDocs} -->

### Architecture at a glance

<!-- {=repoArchitectureAtAGlanceDocs} -->

```text
monopi repo
├── installer
│   └── @monopi/monopi
├── default runtime packages
│   ├── extensions
│   ├── background-tasks
│   ├── diagnostics
│   ├── subagents
│   └── web-remote
├── content packs
│   ├── themes
│   ├── skills
│   └── agents
├── opt-in extras
│   ├── adaptive-routing
│   ├── provider-catalog
│   ├── provider-cursor
│   ├── provider-ollama
│   ├── analytics-extension
│   ├── pi-remote-tailscale
│   ├── pi-bash-live-view
│   └── pi-pretty
└── contributor libraries
    ├── core
    ├── cli
    ├── shared-qna
    ├── web-client
    ├── web-server
    ├── db
    ├── analytics-db
    ├── analytics-dashboard
    └── docs
```

<!-- {/repoArchitectureAtAGlanceDocs} -->

## Packages

| Package                      | Contents                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@monopi/extension-worktree` | Split session extension packages such as git-guard, custom-footer, tool-metadata, scheduler, usage-tracker, btw/qq, watchdog, external-editor, and worktree |
| `@monopi/background-tasks`   | Reactive background shell tasks with `/bg`, `Ctrl+Shift+B`, log tails, and the `bg_task` tool                                                               |
| `@monopi/diagnostics`        | Prompt completion timestamps, durations, per-turn timing, widget, and `/diagnostics`                                                                        |
| `@monopi/subagents`          | Subagent orchestration runtime (`subagent`, `subagent_status`, `/run`, `/chain`, `/parallel`, `/agents`)                                                    |
| `@monopi/web-remote`         | `/remote` session sharing for browser-oriented remote access                                                                                                |
| `@monopi/skills`             | 19 skills including web-search, web-fetch, context7, debug-helper, shell syntax, quick-setup, and more                                                      |
| `@monopi/agents`             | 5 AGENTS.md templates for common roles                                                                                                                      |

Optional packages that stay opt-in:

<!-- {=repoExperimentalPackagesDocs} -->

Opt-in packages that stay separate from the default installer bundle:

- `@monopi/extension-bg-process`
- `@monopi/adaptive-routing`
- `@monopi/provider-catalog`
- `@monopi/provider-cursor`
- `@monopi/provider-ollama`
- `@monopi/analytics-extension`
- `@monopi/remote-tailscale`
- `@monopi/bash-live-view`
- `@monopi/pretty`

<!-- {/repoExperimentalPackagesDocs} -->

## Getting Started

```bash
npx @monopi/monopi
pi
```

For the full package-by-package feature inventory and the local development workflow, see the repo README and `docs/feature-catalog.md` in GitHub.
