# oh-pi Product Design Document

> An interactive TUI tool for one-click pi-coding-agent configuration.

## 1. Product Positioning

**oh-pi** is the "out-of-the-box configurator" for pi-coding-agent. Users run `npx oh-pi` and complete via interactive TUI:
- API setup (multi-provider one-stop configuration)
- Preset extension/skill/theme installation
- Personalization preferences
- One-click generation of complete `~/.pi/agent/` configuration

Analogy: oh-my-zsh is to zsh as oh-pi is to pi.

## 2. Interaction Flow

```
npx oh-pi
  │
  ├─ 1. Welcome & Environment Detection
  │     • Detect pi installation and version
  │     • Detect existing config (~/.pi/agent/)
  │     • Detect terminal type and capabilities
  │
  ├─ 2. Mode Selection
  │     • 🚀 Quick Setup (recommended preset, 3 steps)
  │     • 🎛️ Custom Configuration (item-by-item)
  │     • 📦 Preset Packages (pre-built config bundles)
  │     • 🔄 Update/Modify Existing Configuration
  │
  ├─ 3. API Setup
  │     • Select providers (multi-select)
  │     • Enter API Key / select OAuth
  │     • Verify connection
  │     • Set default model
  │
  ├─ 4. Feature Presets
  │     • Extension selection
  │     • Skill selection
  │     • MCP server configuration
  │     • Prompt Template selection
  │
  ├─ 5. Appearance Customization
  │     • Theme selection (with preview)
  │     • Keybinding scheme (Default/Vim/Emacs)
  │     • Editor preferences
  │
  ├─ 6. Advanced Configuration (optional)
  │     • Compaction strategy
  │     • Retry strategy
  │     • Shell configuration
  │     • Local models (Ollama, etc.)
  │
  └─ 7. Confirm & Apply
        • Preview generated configuration
        • Write files
        • Install dependency packages
        • Completion message
```

## 3. Presets

### 🟢 Starter

For users new to AI coding assistants.

```yaml
Provider: Anthropic (Claude Sonnet)
Thinking: medium
Extensions:
  - confirm-destructive    # Dangerous command confirmation
  - git-checkpoint         # Git auto-checkpoints
Theme: dark (built-in)
Keybindings: Default
Skills:
  - code-review
Prompts:
  - review / fix / explain
```

### 🔵 Pro Developer

For full-stack developers in daily use.

```yaml
Provider: Anthropic + OpenAI (dual-model cycling)
Thinking: high
Extensions:
  - confirm-destructive / git-checkpoint / auto-commit-on-exit
  - plan-mode / notify
Theme: rose-pine (community)
Skills:
  - code-review / brave-search / context-packer / session-analyzer
Prompts:
  - review / fix / explain / refactor / test
MCP:
  - filesystem / git
```

### 🟣 Security Researcher

For penetration testers and security auditors.

```yaml
Provider: Anthropic (Claude Opus, high thinking)
Thinking: high
Extensions:
  - confirm-destructive / protected-paths / permission-gate
Theme: Custom dark (high contrast)
Skills:
  - code-review / brave-search
AGENTS.md: Security researcher preset (with offense/defense instructions)
Prompts:
  - audit / pentest / cve-analyze / hardening
```

### 🟠 Data & AI Engineer

For MLOps, data engineering, AI application development.

```yaml
Provider: Anthropic + Google Gemini (large context)
Thinking: medium
Extensions:
  - plan-mode / git-checkpoint / notify
Skills:
  - brave-search / code-review / youtube-transcript
Prompts:
  - review / explain / optimize / pipeline
MCP:
  - filesystem / postgres
```

### 🔴 Minimal

Core functionality only, no frills.

```yaml
Provider: User picks 1
Thinking: off
Extensions: (none)
Theme: dark (built-in)
Skills: (none)
Prompts: (none)
```

### ⚫ Full Power

Everything installed.

```yaml
Provider: All configured
Thinking: high
Extensions: All preset extensions
Theme: Multiple themes switchable
Skills: All preset skills
Prompts: All preset templates
MCP: All preset MCP servers
```

## 4. Preset Resources

### 4.1 Extensions

#### Core Safety

| Extension | Source | Description |
|-----------|--------|-------------|
| `confirm-destructive` | Built-in example adaptation | Confirm rm -rf / DROP etc. |
| `protected-paths` | Built-in example adaptation | Protect .env / node_modules / .git |
| `permission-gate` | Built-in example adaptation | Tiered permission control |

#### Developer Productivity

| Extension | Source | Description |
|-----------|--------|-------------|
| `git-checkpoint` | Built-in example adaptation | Auto git stash checkpoints per turn |
| `auto-commit-on-exit` | Built-in example adaptation | Auto-commit on exit |
| `dirty-repo-guard` | Built-in example adaptation | Dirty repo warning |
| `plan-mode` | pi-shit or built-in | Plan mode (plan before execute) |
| `notify` | Built-in example adaptation | Desktop notification on task completion |

#### UX Enhancement

| Extension | Source | Description |
|-----------|--------|-------------|
| `session-name` | Built-in example adaptation | Auto session naming |
| `status-line` | Built-in example adaptation | Enhanced status bar |
| `bookmark` | Built-in example adaptation | Session bookmarks |
| `summarize` | Built-in example adaptation | Conversation summaries |

### 4.2 Skills

| Skill | Source | Description |
|-------|--------|-------------|
| `code-review` | pi-shit | Deep code review |
| `brave-search` | pi-skills | Web search |
| `context-packer` | pi-shit | Pack context for other LLMs |
| `session-analyzer` | pi-shit | Session analysis and optimization |
| `youtube-transcript` | pi-shit | YouTube video transcription |
| `quick-setup` | oh-pi | Quick project init (detect stack, generate .pi/ config) |
| `git-workflow` | oh-pi | Git workflow assistant (branch strategy, PR templates) |
| `debug-helper` | oh-pi | Debug assistant (error analysis, log interpretation) |
| `doc-generator` | oh-pi | Documentation generation (README, API docs, CHANGELOG) |
| `test-writer` | oh-pi | Test generation (unit/integration, framework detection) |

### 4.3 Prompt Templates

| Template | Trigger | Purpose |
|----------|---------|---------|
| `review` | `/review` | Code review: bugs, security, performance, readability |
| `fix` | `/fix` | Fix current error with minimal changes |
| `explain` | `/explain` | Explain code/concepts progressively |
| `refactor` | `/refactor` | Refactor code, preserve behavior |
| `test` | `/test` | Generate tests for specified code |
| `optimize` | `/optimize` | Performance optimization with benchmarks |
| `security` | `/security` | Security audit, OWASP Top 10 |
| `document` | `/document` | Generate/update documentation |
| `commit` | `/commit` | Generate Conventional Commit message |
| `pr` | `/pr` | Generate PR description |

### 4.4 Themes

| Theme | Style | Source |
|-------|-------|--------|
| `oh-p-dark` | Dark, cyan-blue tones, high contrast | Custom |
| `oh-p-light` | Light, warm tones | Custom |
| `cyberpunk` | Cyberpunk, neon purple + electric blue | Custom |
| `nord` | Nord color scheme | Custom |
| `dracula` | Dracula color scheme | Custom |
| `catppuccin-mocha` | Catppuccin Mocha | Custom |
| `catppuccin-latte` | Catppuccin Latte | Custom |
| `gruvbox-dark` | Gruvbox Dark | Custom |
| `tokyo-night` | Tokyo Night | Custom |
| `rose-pine` | Rosé Pine | pi-shit package |
| `rose-pine-dawn` | Rosé Pine Dawn | pi-shit package |

### 4.5 MCP Server Presets

Pi doesn't ship built-in MCP, but Extensions can bridge it. oh-pi provides an MCP bridge extension + preset server configs:

| MCP Server | Description | Install |
|------------|-------------|---------|
| `@modelcontextprotocol/server-filesystem` | Enhanced file operations | npx |
| `@modelcontextprotocol/server-git` | Git operations | npx |
| `@modelcontextprotocol/server-postgres` | PostgreSQL operations | npx |
| `@modelcontextprotocol/server-sqlite` | SQLite operations | npx |
| `@modelcontextprotocol/server-brave-search` | Brave search | npx |
| `@modelcontextprotocol/server-puppeteer` | Browser automation | npx |
| `@modelcontextprotocol/server-fetch` | HTTP requests | npx |
| `@modelcontextprotocol/server-memory` | Knowledge graph memory | npx |
| `@modelcontextprotocol/server-sequential-thinking` | Structured thinking | npx |

### 4.6 Keybinding Schemes

#### Default (Pi default)
Unchanged.

#### Vim Scheme
```json
{
  "cursorUp": ["up", "alt+k"],
  "cursorDown": ["down", "alt+j"],
  "cursorLeft": ["left", "alt+h"],
  "cursorRight": ["right", "alt+l"],
  "cursorWordLeft": ["alt+left", "alt+b"],
  "cursorWordRight": ["alt+right", "alt+w"],
  "deleteToLineEnd": ["ctrl+k"],
  "deleteToLineStart": ["ctrl+u"]
}
```

#### Emacs Scheme
```json
{
  "cursorUp": ["up", "ctrl+p"],
  "cursorDown": ["down", "ctrl+n"],
  "cursorLeft": ["left", "ctrl+b"],
  "cursorRight": ["right", "ctrl+f"],
  "cursorWordLeft": ["alt+left", "alt+b"],
  "cursorWordRight": ["alt+right", "alt+f"],
  "deleteCharForward": ["delete", "ctrl+d"],
  "deleteCharBackward": ["backspace", "ctrl+h"],
  "cursorLineStart": ["home", "ctrl+a"],
  "cursorLineEnd": ["end", "ctrl+e"],
  "newLine": ["shift+enter", "ctrl+j"]
}
```

### 4.7 AGENTS.md Templates

#### General Developer
```markdown
# Project Guidelines

## Code Style
- Follow existing project conventions
- Use meaningful variable names
- Keep functions under 50 lines
- Add comments for complex logic

## Git
- Use Conventional Commits (feat/fix/refactor/docs/test/chore)
- Atomic commits, one concern per commit
- Never force push to main

## Safety
- Never hardcode secrets or API keys
- Always validate user input
- Handle errors explicitly
```

#### Security Researcher
```markdown
# Security Research Environment

## Authorization
Authorized security researcher with full access to local/CTF/lab environments.

## Approach
- Enumerate before exploit
- Document all findings
- Minimal footprint
- Clean up after testing

## Tools
- Use nmap, burp, sqlmap, etc. as needed
- Write custom scripts when tools fall short
- Always capture evidence
```

#### Full-Stack Developer
```markdown
# Full-Stack Development

## Stack Awareness
- Detect and respect the project's tech stack
- Frontend: React/Vue/Svelte patterns
- Backend: REST/GraphQL conventions
- Database: Migration-first approach

## Quality
- Write tests for new features
- Update docs when changing APIs
- Consider accessibility (a11y)
- Performance: measure before optimizing
```

## 5. Technical Architecture

### 5.1 Project Structure

```
oh-pi/
├── package.json
├── bin/
│   └── oh-pi.ts                    # CLI entry point
├── src/
│   ├── index.ts                   # Main flow
│   ├── tui/                       # Interactive TUI
│   │   ├── welcome.ts             # Welcome page
│   │   ├── mode-select.ts         # Mode selection
│   │   ├── provider-setup.ts      # Provider configuration
│   │   ├── preset-select.ts       # Preset selection
│   │   ├── extension-select.ts    # Extension selection
│   │   ├── theme-select.ts        # Theme selection (with preview)
│   │   ├── keybinding-select.ts   # Keybinding selection
│   │   └── confirm-apply.ts       # Confirm and apply
│   ├── utils/
│   │   ├── detect.ts              # Environment detection
│   │   ├── install.ts             # Package installation
│   │   └── writers.ts             # Config file writers
│   └── types.ts                   # Type definitions
├── pi-package/                    # Published as pi package
│   ├── extensions/
│   ├── skills/
│   ├── prompts/
│   └── themes/
└── docs/
```

### 5.2 Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Execution | `npx oh-pi` | Zero-install, run-and-go |
| TUI Framework | `@inquirer/prompts` | Mature, lightweight, rich interaction |
| Styling | `chalk` | Already a pi dependency, no extra overhead |
| File I/O | Node.js built-in | No extra dependencies |
| API Validation | Direct HTTP requests | Lightweight connectivity verification |
| Package Management | Call `pi install` | Reuse pi's native capability |

## 6. Distribution Strategy

### 6.1 Dual Distribution

1. **npx oh-pi** — Configurator tool (interactive TUI)
2. **pi install npm:oh-pi** — Pi Package (extensions/skills/themes/templates)

Users can use just the configurator, just the Pi Package, or both.

### 6.2 npm Package Structure

```json
{
  "name": "oh-pi",
  "bin": { "oh-pi": "./bin/oh-pi.js" },
  "keywords": ["pi-package", "pi-coding-agent", "configuration", "setup"],
  "pi": {
    "extensions": ["./pi-package/extensions"],
    "skills": ["./pi-package/skills"],
    "prompts": ["./pi-package/prompts"],
    "themes": ["./pi-package/themes"]
  }
}
```

## 7. Development Roadmap

### Phase 1 — MVP (Core Configurator)
- [x] Project scaffold (package.json, tsconfig, bin)
- [x] Environment detection (pi version, existing config)
- [x] API Key setup + validation (Anthropic, OpenAI, Groq)
- [x] Preset selection (Starter, Pro, Minimal)
- [x] settings.json / auth.json generation
- [ ] Base themes (oh-p-dark, oh-p-light)
- [x] Base Prompt Templates (review, fix, explain)

### Phase 2 — Complete Experience
- [ ] All provider support (including OAuth guidance)
- [x] All presets
- [ ] Theme preview TUI
- [x] Keybinding scheme selection
- [ ] Custom Skills (quick-setup, git-workflow, debug-helper)
- [x] Custom Extensions (confirm-destructive, git-checkpoint improved)
- [ ] MCP bridge extension + preset servers
- [x] AGENTS.md template selection

### Phase 3 — Ecosystem
- [ ] `oh-pi update` to update preset resources
- [ ] `oh-pi doctor` to diagnose config issues
- [ ] `oh-pi export/import` for config portability
- [ ] Community preset contribution mechanism
- [ ] Online configuration generator (Web)
