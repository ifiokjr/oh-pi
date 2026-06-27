---
default: minor
---

Add @monopi/extension-prompt-modes package

**What changed:**

- Ports the prompt modes extension from `mitsuhiko/agent-stuff` `extensions/prompt-editor.ts` into a new `@monopi/extension-prompt-modes` package.
- Registers the `/mode` command (select/apply/store) and `ctrl+shift+m` / `ctrl+space` shortcuts.
- Replaces upstream `catch (err: any)` with typed `unknown` handlers, removes useless `\"` escapes inside template literals, and replaces `as any` casts with typed equivalents to satisfy the `no-explicit-any` and `no-useless-escape` lint rules.
- Adds Apache-2.0 attribution and registers the package in `monochange.toml`, the root `pi.extensions` array, and the git-install manifest test.