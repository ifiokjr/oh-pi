---
monopi: minor
---

Add @monopi/extension-goal package

**What changed:**

- Ports the session-log-backed long-running objective mode from `mitsuhiko/agent-stuff` `extensions/goal.ts` into a new `@monopi/extension-goal` package.
- Registers the `/goal` command (set/view/edit/pause/resume/clear) and `get_goal`, `create_goal`, `update_goal` tools.
- Hoists the inline usage-error regex to module scope per repo performance rules.
- Registers the package in the root `pi.extensions` array and the git-install manifest test.
- Adds Apache-2.0 attribution and package license `MIT AND Apache-2.0`.