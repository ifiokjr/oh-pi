---
default: patch
---

Fix PTY-backed `!` commands when `node-pty` installs its prebuilt `spawn-helper` without executable permissions.

The bash live-view extension now checks the active `node-pty/prebuilds/<platform>-<arch>/spawn-helper` path as well as the legacy `build/Release` path and chmods the helper before launching PTY sessions.
