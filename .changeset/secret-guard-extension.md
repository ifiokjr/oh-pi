---
default: minor
---

"feat: add secret-guard extension to redact secrets before sending to LLM"

New extension `secret-guard` that scans all messages and the system prompt for secret patterns (AWS keys, GitHub tokens, Stripe keys, private keys, JWTs, connection strings, env-var values) and redacts them before they reach the LLM.

Configuration via `PI_SECRET_GUARD_LEVEL` env var:
- `off` — no redaction
- `patterns` (default) — regex-based redaction only
- `env` — environment-variable-value redaction only
- `all` — both patterns and env values

Extra patterns can be added via `PI_SECRET_GUARD_EXTRA_PATTERNS` (JSON array of `{pattern, label}`).

Shows a status indicator on session start when active.