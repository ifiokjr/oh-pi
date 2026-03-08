---
default: minor
---

### `@ifi/oh-pi-core` — Initial release

Shared foundation library for all oh-pi packages.

- **Type system**: Full TypeScript type definitions for `OhPConfig`, `ProviderConfig`,
  `WizardBaseConfig`, `Preset`, and all extension/theme/skill/prompt registries
- **Extension registry**: Declarative `EXTENSIONS` array with metadata (name, description, file
  path, default-on/off, category) for all 9 extensions including the new `usage-tracker`
- **Theme registry**: 6 theme definitions (oh-pi Dark, Cyberpunk, Nord, Catppuccin Mocha, Tokyo
  Night, Gruvbox Dark) with file paths and emoji indicators
- **Prompt registry**: 10 prompt template registrations (`/review`, `/fix`, `/explain`, `/refactor`,
  `/test`, `/commit`, `/pr`, `/security`, `/optimize`, `/document`)
- **Skill registry**: 10 skill definitions across tool, UI-design, and workflow categories
- **i18n module**: Bilingual (English/Chinese) translation system with locale detection and `t()`
  helper function
- **Preset system**: Pre-configured profiles (Full Power, Clean, Colony Only) mapping to curated
  extension/theme/thinking-level combinations
