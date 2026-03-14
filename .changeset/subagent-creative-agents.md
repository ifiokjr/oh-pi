---
default: minor
---

Add new builtin subagents for creative and multimodal tasks.

- add an `artist` agent tuned for SVG creation and concrete visual asset briefs using `gemini-3.1-pro-high`
- add a `frontend-designer` agent tuned for distinctive, production-grade UI implementation using `claude-opus-4-6`
- add a `multimodal-summariser` agent tuned for summarizing image, audio, and video inputs using `gemini-3-flash`
- document the new builtin agents and cover their bundled discovery in tests
