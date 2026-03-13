# @ifi/oh-pi

> All-in-one setup for pi-coding-agent — extensions, themes, prompts, skills, and ant-colony swarm.

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

## Packages

| Package                 | Contents                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `@ifi/oh-pi-extensions`      | safe-guard, git-guard, auto-session, custom-footer, compact-header, auto-update, bg-process |
| `@ifi/oh-pi-ant-colony`       | Multi-agent swarm extension (`/colony`, colony commands)                                     |
| `@ifi/pi-extension-subagents` | Subagent orchestration extension (`subagent`, `subagent_status`, `/run`, `/chain`, `/parallel`) |
| `@ifi/pi-plan`                | Planning mode extension (`/plan`, `Alt+P`, `task_agents`, `set_plan`)                       |
| `@ifi/oh-pi-themes`           | cyberpunk, nord, gruvbox, tokyo-night, catppuccin, oh-p-dark                                 |
| `@ifi/oh-pi-prompts`         | review, fix, explain, refactor, test, commit, pr, and more                                  |
| `@ifi/oh-pi-skills`          | web-search, debug-helper, git-workflow, rust-workspace-bootstrap, and more                  |
| `@ifi/oh-pi-agents`          | AGENTS.md templates for common roles                                                        |

> **Note:** `safe-guard` is included in `@ifi/oh-pi-extensions` but disabled by default. Enable it
> via `pi config` if you want command/path safety prompts.

## TUI Configurator

```bash
npx @ifi/oh-pi-cli
```
