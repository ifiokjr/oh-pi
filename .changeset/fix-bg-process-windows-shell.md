---
default: patch
---

Fix the `bg-process` bash tool override to use pi's shell resolution on Windows instead of hardcoding `spawn("bash")`, and write background logs to the platform temp directory.
