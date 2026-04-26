# @ifi/oh-pi

> All-in-one setup for pi-coding-agent — extensions, prompts, skills, themes, remote sharing, and ant-colony workflows.

## Install

```bash
npx @ifi/oh-pi
```

This registers all oh-pi packages with pi in one command. Each package is installed separately so pi
can load extensions with proper module resolution.

### Options

```bash
npx @ifi/oh-pi                      # install latest versions (global)
npx @ifi/oh-pi --version 0.2.13     # pin to a specific version
npx @ifi/oh-pi --local              # install to project .pi/settings.json
npx @ifi/oh-pi --remove             # uninstall all oh-pi packages from pi
```

## Start Here

<!-- {=repoStartHerePathDocs} -->

Use this reading path depending on what you are trying to do:

- **I just want to use oh-pi** → start in the root `README.md`, then jump into `docs/feature-catalog.md` for package-by-package detail
- **I want to try the latest local changes** → run `pnpm install`, `pnpm pi:local`, restart `pi`, then exercise the feature in a real session
- **I want to contribute** → read `CONTRIBUTING.md`, then the package README for the area you are changing
- **I want to understand ownership** → use `docs/feature-catalog.md` to see which package owns which runtime feature, content pack, or library surface

<!-- {/repoStartHerePathDocs} -->

### Architecture at a glance

<!-- {=repoArchitectureAtAGlanceDocs} -->

```text
oh-pi repo
├── installer
│   └── @ifi/oh-pi
├── default runtime packages
│   ├── extensions
│   ├── background-tasks
│   ├── diagnostics
│   ├── ant-colony
│   ├── subagents
│   ├── plan
│   ├── spec
│   └── web-remote
├── content packs
│   ├── themes
│   ├── prompts
│   ├── skills
│   └── agents
├── opt-in extras
│   ├── adaptive-routing
│   ├── provider-catalog
│   ├── provider-cursor
│   ├── provider-ollama
│   ├── pi-remote-tailscale
│   ├── pi-bash-live-view
│   └── pi-pretty
└── contributor libraries
    ├── core
    ├── cli
    ├── shared-qna
    ├── web-client
    └── web-server
```

<!-- {/repoArchitectureAtAGlanceDocs} -->

## Packages

| Package                       | Contents                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@ifi/oh-pi-extensions`       | 13 core session features including git-guard, auto-session-name, custom-footer, tool-metadata, scheduler, usage-tracker, btw/qq, watchdog, bg-process, external-editor, and worktree |
| `@ifi/pi-background-tasks`    | Reactive background shell tasks with `/bg`, `Ctrl+Shift+B`, log tails, and the `bg_task` tool                                                                                        |
| `@ifi/oh-pi-ant-colony`       | Multi-agent swarm extension (`ant_colony`, `/colony*`, colony panel, isolated worktrees, pheromone/task orchestration)                                                               |
| `@ifi/pi-diagnostics`         | Prompt completion timestamps, durations, per-turn timing, widget, and `/diagnostics`                                                                                                 |
| `@ifi/pi-extension-subagents` | Subagent orchestration runtime (`subagent`, `subagent_status`, `/run`, `/chain`, `/parallel`, `/agents`)                                                                             |
| `@ifi/pi-plan`                | Planning mode extension (`/plan`, `Alt+P`, `task_agents`, `steer_task_agent`, `set_plan`)                                                                                            |
| `@ifi/pi-spec`                | Native spec-driven workflow package with `/spec` and local `.specify/` scaffolding                                                                                                   |
| `@ifi/pi-web-remote`          | `/remote` session sharing for browser-oriented remote access                                                                                                                         |
| `@ifi/oh-pi-themes`           | 6 themes: cyberpunk, nord, gruvbox, tokyo-night, catppuccin-mocha, oh-p-dark                                                                                                         |
| `@ifi/oh-pi-prompts`          | 10 prompt templates including review, fix, explain, refactor, test, commit, pr, and document                                                                                         |
| `@ifi/oh-pi-skills`           | 17 skills including web-search, web-fetch, context7, debug-helper, git-workflow, quick-setup, and more                                                                               |
| `@ifi/oh-pi-agents`           | 5 AGENTS.md templates for common roles                                                                                                                                               |

Optional packages that stay opt-in:

<!-- {=repoExperimentalPackagesDocs} -->

Opt-in packages that stay separate from the default installer bundle:

- `@ifi/pi-extension-adaptive-routing`
- `@ifi/pi-provider-catalog`
- `@ifi/pi-provider-cursor`
- `@ifi/pi-provider-ollama`
- `@ifi/pi-remote-tailscale`
- `@ifi/pi-bash-live-view`
- `@ifi/pi-pretty`

<!-- {/repoExperimentalPackagesDocs} -->

## Getting Started

```bash
npx @ifi/oh-pi
pi
```

For the full package-by-package feature inventory and the local development workflow, see the repo
README and `docs/feature-catalog.md` in GitHub.
