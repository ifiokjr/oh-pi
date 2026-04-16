---
default: patch
---

Align Ollama cloud GLM models with the z.ai request semantics used upstream.

- normalize cloud `glm-*` models to use z.ai-compatible thinking flags and `tool_stream`
- raise cloud GLM max token defaults so the provider can keep a 32k default output budget
- add regression coverage for GLM request shaping and visible streamed text
