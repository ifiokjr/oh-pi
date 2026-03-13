---
"@ifi/oh-pi-ant-colony": patch
"@ifi/oh-pi": patch
---

Fix ant-colony JSON task-plan parsing so malformed scout output no longer produces invalid execution plans:

- only accept fenced JSON plans when they are task arrays, nested `tasks` arrays, or single task-like objects
- ignore JSON entries that omit both `title` and `description`
- normalize JSON task titles/descriptions consistently with markdown task parsing
- add parser regression tests for nested JSON plans and missing task fields
