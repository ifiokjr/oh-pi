---
default: minor
---

Make the `pi-plan` and `pi-spec` extensions installable through the oh-pi configurator's extension workflow.

- add `plan` to the selectable extension registry alongside `spec`
- teach the CLI extension writer how to copy the `pi-plan` runtime into `.pi/agent/extensions/plan`
- vendor the plan runtime's `@ifi/pi-shared-qna` and `@ifi/pi-extension-subagents` dependencies so local installs resolve correctly
- add CLI package dependencies and regression tests covering plan/spec extension resource resolution and local extension copying
