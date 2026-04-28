---
default: patch
---

Diagnostics now records prompt runs only when they come from meaningful user input and produce useful activity to inspect. It also keeps recent prompt history and nests interrupted child prompts, which reduces noisy extension-generated records and makes complex prompt runs easier to understand.
