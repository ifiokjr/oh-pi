---
default: patch
---

Keep the lockstep release config and publish metadata in sync with every workspace package so `knope release` and publish verification do not leave newly added packages out of version bumps or packaging checks. Also make dedicated extension copies resilient to symlinked runtime bins during setup.
