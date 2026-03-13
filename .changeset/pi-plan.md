---
default: minor
---

Add a new planning mode package, `@ifi/pi-plan`, plus a shared first-party `@ifi/pi-shared-qna`
library in the monorepo.

- vendor the `plan-md` workflow from `sids/pi-extensions` into `packages/plan` and adapt it to the `/plan` command
- back plan research tasks with the in-repo subagent runtime from `@ifi/pi-extension-subagents`
- vendor the shared Q&A TUI component into `packages/shared-qna` to avoid third-party pi package dependencies
- include `@ifi/pi-plan` in the `@ifi/oh-pi` bundle and monorepo docs
- add Vitest coverage for plan flow, prompts, state, request-user-input, task agents, utilities, and shared Q&A helpers
