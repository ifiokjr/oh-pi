---
monopi: minor
---

Add @monopi/extension-todos package

**What changed:**

- Ports the file-backed todo management extension from `mitsuhiko/agent-stuff` `extensions/todos.ts` into a new `@monopi/extension-todos` package.
- Registers the `/todos` command (visual todo manager) and the `todo` tool (list/list-all/get/create/update/append/delete/claim/release).
- Replaces the upstream `catch (error: any)` with a typed `unknown` handler to satisfy the repo `no-explicit-any` lint rule.
- Adds Apache-2.0 attribution and registers the package in `monochange.toml`, the root `pi.extensions` array, and the git-install manifest test.