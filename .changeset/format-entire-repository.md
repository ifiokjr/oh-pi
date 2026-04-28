---
default: patch
---

The formatting scripts now run oxfmt over the whole repository instead of a small set of TypeScript and root JSON globs. This lets `pnpm format` restore Markdown, YAML, package manifests, and other supported tracked files after another formatter changes them.
