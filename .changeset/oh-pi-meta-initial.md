---
default: minor
---

### `@ifi/oh-pi` — Initial release

Meta-package that bundles all oh-pi packages for one-command installation.

- **Single install**: `pi install npm:@ifi/oh-pi` adds all extensions, themes, prompts, skills, and
  agents templates
- **Bundled dependencies**: All sub-packages are listed as `bundledDependencies` so pi gets
  everything in one `npm install`
- **Pi package manifest**: Declares extension, theme, prompt, and skill paths via the `pi` field so
  pi auto-discovers all resources
- **Transitive packages**: Pulls in `@ifi/oh-pi-extensions`, `@ifi/oh-pi-ant-colony`,
  `@ifi/oh-pi-themes`, `@ifi/oh-pi-prompts`, `@ifi/oh-pi-skills`, and `@ifi/oh-pi-agents`
