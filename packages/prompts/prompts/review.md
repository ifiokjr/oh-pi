---
description: Review code for bugs, security issues, and improvements
---

Review the code I'm about to share (or the current file). Focus on:

1. **Bugs & Logic Errors** — Off-by-one, null/undefined, race conditions
2. **Security** — Injection, auth bypass, data exposure, hardcoded secrets
3. **Error Handling** — Missing try/catch, unhandled promises, silent failures
4. **Performance** — N+1 queries, unnecessary re-renders, memory leaks
5. **Readability** — Naming, complexity, dead code

For each issue found, provide:

- Severity (🔴 Critical / 🟡 Warning / 🔵 Info)
- Location (file:line)
- Problem description
- Suggested fix

$@
