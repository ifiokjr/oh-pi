# Pi Skills, Prompt Templates, Themes, and Packages

## 1. Skills

Skills are on-demand capability packs following the [Agent Skills Standard](https://agentskills.io).

### Locations

| Location                       | Scope            |
| ------------------------------ | ---------------- |
| `~/.pi/agent/skills/`          | Global           |
| `.pi/skills/`                  | Project-level    |
| Package `skills/` directory    | Package-level    |
| `settings.json` `skills` array | Additional paths |
| `--skill <path>`               | CLI override     |

Discovery: root-level `.md` files + recursive `SKILL.md` in subdirectories.

### How It Works

1. Scanned at startup; name and description extracted
2. Available skills listed in system prompt as XML
3. When a task matches, the agent loads the full SKILL.md via `read`
4. Agent follows instructions, using relative paths for scripts and resources

### SKILL.md Format

```markdown
---
name: my-skill
description: Skill description — determines when it's loaded. Be specific.
---

# My Skill

## Setup

\`\`\`bash cd /path/to/skill && npm install \`\`\`

## Usage

\`\`\`bash ./scripts/process.sh <input> \`\`\`
```

### Frontmatter Fields

| Field                      | Required | Description                                                               |
| -------------------------- | -------- | ------------------------------------------------------------------------- |
| `name`                     | ✅       | ≤64 chars, lowercase + digits + hyphens, must match parent directory name |
| `description`              | ✅       | ≤1024 chars, describes functionality and trigger scenarios                |
| `license`                  | ❌       | License                                                                   |
| `compatibility`            | ❌       | Environment requirements                                                  |
| `metadata`                 | ❌       | Arbitrary key-value pairs                                                 |
| `disable-model-invocation` | ❌       | When true, hidden from system prompt; only callable via `/skill:name`     |

### Skill Commands

```bash
/skill:brave-search           # Load and execute
/skill:pdf-tools extract      # With arguments
```

Toggle `enableSkillCommands` in `/settings` or `settings.json`.

### Cross-Tool Skills

Load skills from Claude Code or OpenAI Codex:

```json
{ "skills": ["~/.claude/skills", "~/.codex/skills"] }
```

---

## 2. Prompt Templates

Markdown snippets expanded by typing `/name`.

### Locations

| Location                     | Scope         |
| ---------------------------- | ------------- |
| `~/.pi/agent/prompts/*.md`   | Global        |
| `.pi/prompts/*.md`           | Project-level |
| Package `prompts/` directory | Package-level |
| `--prompt-template <path>`   | CLI override  |

Discovery: non-recursive, only the `prompts/` root directory.

### Format

```markdown
---
description: Review staged git changes
---

Review staged changes (`git diff --cached`). Focus on:

- Bugs and logic errors
- Security issues
- Missing error handling
```

Filename becomes command name: `review.md` → `/review`

### Parameter Support

- `$1`, `$2`, ... — Positional parameters
- `$@` or `$ARGUMENTS` — All arguments
- `${@:N}` — From the Nth argument onward
- `${@:N:L}` — L arguments starting from Nth

```
/component Button "onClick handler" "disabled support"
```

---

## 3. Themes

JSON files defining TUI colors. Supports hot reload.

### Locations

- Built-in: `dark`, `light`
- Global: `~/.pi/agent/themes/*.json`
- Project: `.pi/themes/*.json`
- Packages / settings / CLI

### Theme Format

```json
{
  "$schema": "https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "my-theme",
  "vars": { "primary": "#00aaff", "secondary": 242 },
  "colors": {
    /* all 51 color tokens must be defined */
  }
}
```

### 51 Color Token Categories

| Category               | Count | Examples                                                     |
| ---------------------- | ----- | ------------------------------------------------------------ |
| Core UI                | 11    | accent, border, success, error, warning, muted, dim, text... |
| Backgrounds & Content  | 11    | selectedBg, userMessageBg, toolPendingBg, toolTitle...       |
| Markdown               | 10    | mdHeading, mdLink, mdCode, mdCodeBlock...                    |
| Tool Diffs             | 3     | toolDiffAdded, toolDiffRemoved, toolDiffContext              |
| Syntax Highlighting    | 9     | syntaxComment, syntaxKeyword, syntaxFunction...              |
| Thinking Level Borders | 6     | thinkingOff ~ thinkingXhigh                                  |
| Bash Mode              | 1     | bashMode                                                     |

### Color Value Formats

| Format    | Example     | Description            |
| --------- | ----------- | ---------------------- |
| Hex       | `"#ff0000"` | 6-digit RGB            |
| 256-color | `39`        | xterm 256-color index  |
| Variable  | `"primary"` | Reference from vars    |
| Default   | `""`        | Terminal default color |

---

## 4. Pi Packages

Bundle Extensions, Skills, Prompts, and Themes for distribution via npm or git.

### Installation & Management

```bash
pi install npm:@foo/bar@1.0.0       # npm (version-locked)
pi install git:github.com/user/repo@v1  # git (ref-locked)
pi install https://github.com/user/repo # HTTPS
pi install ./local/path              # Local path
pi remove npm:@foo/bar
pi list                              # List installed
pi update                            # Update (skips locked versions)
pi config                            # Enable/disable resources
```

`-l` installs to project-level (`.pi/`), otherwise global (`~/.pi/agent/`).

Try temporarily: `pi -e npm:@foo/bar`

### Creating a Package

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Without a `pi` manifest, `extensions/`, `skills/`, `prompts/`, `themes/` directories are
auto-discovered.

### Dependency Handling

- Runtime deps go in `dependencies`
- Pi core packages go in `peerDependencies` with `"*"` range: `@mariozechner/pi-ai`,
  `@mariozechner/pi-agent-core`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`,
  `@sinclair/typebox`
- Other pi packages must be bundled: put in `dependencies` + `bundledDependencies`

### Package Filtering

```json
{
  "packages": [
    {
      "source": "npm:my-package",
      "extensions": ["ext/*.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"]
    }
  ]
}
```

`[]` = don't load that type, `!pattern` = exclude, `+path` = force include.
