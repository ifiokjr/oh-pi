---
default: patch
---

Improve the repo documentation to better cover the full oh-pi feature surface.

- add a package-by-package feature catalog covering runtime packages, content packs, and contributor libraries
- expand the root README with missing extension coverage such as scheduler, BTW/QQ, watchdog, and tool metadata
- add a clearer running-locally guide that explains how `pnpm pi:local` works for local feature testing and development
- refresh package lists and package counts to include newer additions like `pi-web-remote` and the expanded skills pack
- update transitive dependency overrides so security audit checks pass again on the branch
