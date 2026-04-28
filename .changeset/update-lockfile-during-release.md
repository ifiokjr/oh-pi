---
default: patch
---

The release workflow now refreshes the pnpm lockfile after preparing version changes and before creating the release commit. This keeps generated package version updates and the lockfile in sync, reducing failed frozen installs after releases.
