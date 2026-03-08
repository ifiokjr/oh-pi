---
default: minor
---

### Infrastructure and tooling

- **Monorepo**: pnpm workspace with 9 packages under `@ifi/*` npm scope
- **Biome**: Strict linting and formatting (tabs, 120 char width, double quotes, organized imports)
- **tsgo**: `@typescript/native-preview` (official TypeScript 7.0 Go port) for fast type checking
- **GitHub Actions CI**: lint → typecheck → test (Node 20 + 22) → build pipeline with changeset
  enforcement on PRs
- **Knope**: Automated changelog generation, version bumping (lockstep across all packages), git
  tagging, and GitHub releases
- **Vitest**: 254 tests across 21 test files with fake timers for fast execution
- **All documentation translated to English**: 8 main docs, supplementary docs, benchmarks,
  ant-colony README, and 16+ source file comments
