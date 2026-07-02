---
monopi: major
---

# Migrate to monopi

- Rename all packages from @ifi/* to @monopi/* npm org
- Replace knope with monochange for release management
- Add @monopi/db shared SQLite database with Drizzle ORM and schema module registration
- Remove @monopi/prompts package (unused prompt templates)
- Remove @monopi/plan and @monopi/spec packages (retired)
- Remove 15 retired skills, keeping only debug-helper, nushell, and btw
