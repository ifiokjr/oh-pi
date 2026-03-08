---
default: minor
---

### `@ifi/oh-pi-prompts` — Initial release

10 markdown prompt templates for common development tasks.

- `/review` — Code review targeting bugs, security vulnerabilities, and performance issues
- `/fix` — Fix errors with minimal, focused changes
- `/explain` — Explain code at varying levels of detail
- `/refactor` — Refactor code while preserving behavior
- `/test` — Generate comprehensive test suites
- `/commit` — Create Conventional Commit messages from staged changes
- `/pr` — Write pull request descriptions with context and rationale
- `/security` — OWASP-based security audit
- `/optimize` — Performance optimization with profiling guidance
- `/document` — Generate inline documentation and README sections

Each template is a markdown file that pi loads as a slash command. Install via
`pi install npm:@ifi/oh-pi-prompts`.
