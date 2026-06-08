# `@ifi/oh-pi-skills`

> 19 on-demand skill packs that teach pi how to handle specific tasks.

## Why use this?

Prompts are great for one-shot tasks, but skills go deeper. A skill is a set of instructions that pi loads when the user asks for that kind of work. It gives pi domain knowledge, workflows, and conventions for specific topics.

Skills activate **automatically** — when you say "search the web for X", pi loads the `web-search` skill. When you ask for a claymorphism design, pi loads the `claymorphism` skill.

## All 19 skills

### 🔧 Tool Skills

| Skill        | What it does                                        |
| ------------ | --------------------------------------------------- |
| `context7`   | Query up-to-date library docs via Context7 API      |
| `fish`       | Fish shell syntax reference                         |
| `nushell`    | Nushell syntax reference                            |
| `pwsh`       | PowerShell syntax reference                         |
| `web-search` | Search the web via DuckDuckGo (free, no key needed) |
| `web-fetch`  | Extract readable text content from a web page       |

### 🎨 UI Design System Skills

| Skill           | Visual style                       |
| --------------- | ---------------------------------- |
| `liquid-glass`  | Apple WWDC 2025 translucent glass  |
| `glassmorphism` | Frosted glass blur + transparency  |
| `claymorphism`  | Soft 3D clay-like surfaces         |
| `neubrutalism`  | Bold borders, offset solid shadows |

### 🔄 Workflow Skills

| Skill                           | What it does                                                   |
| ------------------------------- | -------------------------------------------------------------- |
| `btw` (/qq)                     | Run side conversations without interrupting main work          |
| `debug-helper`                  | Analyze errors, logs, crashes, and performance                 |
| `quick-setup`                   | Detect project type and generate `.pi/` config                 |
| `grill-me`                      | Stress-test a plan through adversarial questioning             |
| `request-refactor-plan`         | Interview you, create tiny-commit refactor plan, file as issue |
| `improve-codebase-architecture` | Find architecture improvements that deepen modules             |
| `write-a-skill`                 | Author new pi-compatible skills correctly                      |

### 🚀 Bootstrap Skills

| Skill                      | What it does                                      |
| -------------------------- | ------------------------------------------------- |
| `flutter-serverpod-mvp`    | Scaffold full-stack Flutter + Serverpod MVPs      |
| `rust-workspace-bootstrap` | Scaffold Rust workspace with knope, devenv, CI/CD |

## Installation

```bash
pi install npm:@ifi/oh-pi-skills
```

> Installed by default with `npx @ifi/oh-pi`.

## How skills work

- Each skill lives in its own directory under `skills/<skill-name>/`
- Contains a `SKILL.md` file with instructions for pi
- Pi loads the skill when the user's request matches the skill's description
- Skills stay loaded for the duration of the task
- You can explicitly invoke a skill with `/<skill-name>`

## Package layout

```
skills/
├── btw/SKILL.md
├── claymorphism/SKILL.md
├── context7/SKILL.md
├── debug-helper/SKILL.md
├── flutter-serverpod-mvp/SKILL.md
├── fish/SKILL.md
├── glassmorphism/SKILL.md
├── grill-me/SKILL.md
├── improve-codebase-architecture/SKILL.md + REFERENCE.md
├── liquid-glass/SKILL.md
├── neubrutalism/SKILL.md
├── nushell/SKILL.md
├── pwsh/SKILL.md
├── quick-setup/SKILL.md
├── request-refactor-plan/SKILL.md
├── rust-workspace-bootstrap/SKILL.md + templates/
├── web-fetch/SKILL.md
├── web-search/SKILL.md
└── write-a-skill/SKILL.md
```

## Related

- `@ifi/oh-pi-prompts` — prompt templates for quick one-shot commands
- [Pi skills documentation](https://github.com/badlogic/pi-mono) — how skills work in pi
