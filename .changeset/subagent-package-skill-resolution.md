---
default: patch
---

# Subagent package skill resolution

Subagent execution now resolves skill packages through pi's `DefaultPackageManager`, so package-provided skills installed for the main pi instance are available when injecting skills into subagent prompts.
