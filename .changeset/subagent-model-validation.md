---
default: patch
---

Validate subagent models against available models before passing to spawned pi process. Previously, subagents inherited the parent session model (e.g. `github-models/openai/gpt-4o-mini`) without checking whether it was actually available, causing "No models match pattern" warnings. Now, runtime overrides, frontmatter models, and session-default fallbacks are all validated against the available model registry. Invalid models are silently skipped, allowing fallback to delegated category routing or no model override.
