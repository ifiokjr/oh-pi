---
default: minor
---

Add @monopi/extension-files package

**What changed:**

- Ports the file browser extension from `mitsuhiko/agent-stuff` `extensions/files.ts` into a new `@monopi/extension-files` package.
- Registers the `/files` command and `ctrl+shift+o`, `ctrl+shift+f`, `ctrl+shift+r` shortcuts.
- Removes a useless regex escape (`\[` inside a character class) to satisfy the `no-useless-escape` lint rule.
- Adds Apache-2.0 attribution and registers the package in `monochange.toml`, the root `pi.extensions` array, and the git-install manifest test.