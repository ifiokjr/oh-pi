---
monopi: patch
---

The formatting scripts now run oxfmt over the whole repository instead of a small set of TypeScript and root JSON globs. This lets `pnpm format` restore Markdown, YAML, package manifests, and other supported tracked files after another formatter changes them.

Oxfmt now also sorts imports with a consistent grouping for type imports, built-in and external modules, internal aliases, relative imports, and unknown imports. This keeps import order deterministic whenever the repo formatter runs.
