---
"@ifi/pi-extension-subagents": minor
"@ifi/oh-pi": minor
---

Add `@ifi/pi-extension-subagents`, a full-featured subagent orchestration package built on top of
`nicobailon/pi-subagents`.

- vendor the upstream subagent extension runtime, TUI manager, async runner, and bundled builtin agents
- publish it as `@ifi/pi-extension-subagents` with raw TypeScript sources via the package `pi` field
- add a small `npx @ifi/pi-extension-subagents` installer/remover wrapper around `pi install/remove`
- cover the packaged helpers and discovery logic with an extensive Vitest suite
- include the new package in the `@ifi/oh-pi` installer bundle and docs
