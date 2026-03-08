---
default: minor
---

# Monorepo restructure and new extensions

- Split into 9 packages under `@ifi/*` scope
- Added `usage-tracker` extension with CodexBar-inspired rate limit monitoring
- Integrated tsgo (`@typescript/native-preview`) for fast type checking
- Added Biome for strict linting and formatting
- Translated all documentation and comments to English
- Added GitHub Actions CI pipeline with changeset enforcement
- Migrated from npm to pnpm workspace
- Integrated knope for changelog and release management
