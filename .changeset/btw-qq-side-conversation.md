---
default: minor
---

Add `/btw` and `/qq` side-conversation extension and skill:

- `/btw` opens a parallel side conversation without interrupting the main agent run
- `/qq` is an alias for `/btw` ("quick question")
- streams answers into a widget above the editor
- maintains a continuous thread across exchanges, persisted in session state
- keeps BTW entries out of the main agent's LLM context
- supports `--save` to persist an exchange as a visible session note
- sub-commands: `:new`, `:clear`, `:inject`, `:summarize` for thread management
- includes a `btw` skill for discoverability and guidance

Based on https://github.com/dbachelder/pi-btw by Dan Bachelder (MIT).
