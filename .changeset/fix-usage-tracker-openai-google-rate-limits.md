---
default: patch
---

Fix usage-tracker provider probing for OpenAI and Google OAuth auth:

- Use ChatGPT Codex `backend-api/wham/usage` for OpenAI and parse primary/secondary/additional window usage.
- Use Google Cloud Code Assist `v1internal:loadCodeAssist` for Google OAuth metadata instead of the unsupported Generative Language models endpoint.
- Improve OpenAI/Google reporting with clearer plan/account/project details and fallback notes when window data is unavailable.
