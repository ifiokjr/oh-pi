---
default: minor
---

### `@ifi/oh-pi-cli` — Initial release

Interactive TUI configurator that sets up `~/.pi/agent/` in under a minute.

- **Three setup modes**: Quick (3 steps), Preset (2 steps), Custom (6 steps) — each tailored to
  different experience levels
- **Provider auto-detection**: Scans environment variables for API keys from 7 providers (Anthropic,
  OpenAI, Google Gemini, Groq, OpenRouter, xAI, Mistral) and pre-fills configuration
- **TUI components**: Built on `@clack/prompts` with styled selection menus for providers,
  extensions, themes, keybindings, skills, and AGENTS.md templates
- **File writers**: Generates `auth.json` (0600 permissions), `settings.json`, `keybindings.json`,
  `AGENTS.md`, and copies extension/theme/prompt/skill files into `~/.pi/agent/`
- **Backup detection**: Warns when existing configuration exists and offers timestamped backup
  before overwriting
- **Binary entry point**: Ships as `oh-pi` CLI via `npx @ifi/oh-pi-cli`
