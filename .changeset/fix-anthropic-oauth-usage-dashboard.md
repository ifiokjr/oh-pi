---
default: patch
---

Fix Anthropic usage probing in the usage tracker for pi-managed OAuth tokens.

- Use Anthropic's OAuth usage endpoint (`/api/oauth/usage`) for `sk-ant-oat...` tokens (matching Claude Code behavior).
- Avoid false "auth token expired" errors when OAuth is valid but the old probe endpoint is unsupported.
- Surface OAuth endpoint rate limiting as an informational note instead of an auth failure.
- Keep API-key probe fallback via `count_tokens` for non-OAuth Anthropic credentials.
