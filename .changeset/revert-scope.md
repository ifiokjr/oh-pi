---
default: patch
---

### Reverted npm scope back to `@ifi`

The scope was incorrectly changed to `@ifiokjr` due to a misdiagnosed npm auth issue.
The real problem was token permissions, not the scope name. All packages are back to `@ifi/*`.
