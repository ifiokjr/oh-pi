---
description: Security audit following OWASP guidelines
---
Perform a security audit on the following code. Check for:

1. **Injection** — SQL, XSS, command injection, path traversal
2. **Authentication** — Weak auth, missing checks, session issues
3. **Authorization** — Privilege escalation, IDOR, missing access control
4. **Data Exposure** — Sensitive data in logs/responses, hardcoded secrets
5. **Configuration** — Debug mode, default credentials, CORS misconfiguration
6. **Dependencies** — Known vulnerable packages

Rate each finding: 🔴 Critical / 🟠 High / 🟡 Medium / 🔵 Low
Provide remediation for each.

$@
