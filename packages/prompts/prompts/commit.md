---
description: Generate a Conventional Commit message for staged changes
---
Generate a commit message for the current staged changes (`git diff --cached`).

Follow Conventional Commits format:
```
type(scope): description

[optional body]
```

Types: feat, fix, refactor, docs, test, chore, perf, ci, style, build
- Keep the subject line under 72 characters
- Use imperative mood ("add" not "added")
- Body explains WHY, not WHAT (the diff shows what)

$@
