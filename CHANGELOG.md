# Changelog

## 0.2.0

### Features

- Monorepo split into 9 packages under `@ifi/*` scope
- Added `usage-tracker` extension with CodexBar-inspired rate limit monitoring
- Integrated tsgo (`@typescript/native-preview`) for fast type checking
- Added Biome for strict linting and formatting
- Translated all documentation and comments from Chinese to English
- Added GitHub Actions CI pipeline
- Migrated from npm to pnpm workspace

### Fixes

- Fixed ESM `__dirname` usage in `auto-update.ts`
- Extracted helper functions to reduce cognitive complexity across extensions
