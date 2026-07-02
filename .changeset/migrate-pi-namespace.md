---
monopi: major
---

# Migrate Pi namespace and Ollama provider

## Breaking Changes

- **Pi namespace migration: `@mariozechner/pi-*` → `@earendil-works/pi-*`.** The upstream pi packages were renamed at version `0.74.0` and the old `@mariozechner/pi-*` namespace is abandoned (last publish `0.73.1`). All imports, peer dependencies, docs, scripts, and the security allowlist across the monorepo now reference `@earendil-works/pi-*`.
- **Minimum supported pi version bumped from `0.56.1` to `0.78.1`** (the floor under the new namespace and the first version patched against the `@earendil-works/pi-coding-agent` predictable-temp-install advisory GHSA-jfgx-wxx8-mp94, which affects `>=0.74.0 <0.78.1`). `scripts/verify-pi-compat.mjs` now verifies against `MIN_VERSION = 0.78.1` and `CURRENT_VERSION = 0.79.10`. Root dev dependencies pin `@earendil-works/pi-*@0.78.1`; all workspace `@earendil-works/pi-*` peer ranges bumped to `>=0.78.1`.
- **typebox migration: `@sinclair/typebox` (0.34.x) → `typebox` (1.x).** `@earendil-works/pi-ai@0.74+` adopted the renamed `typebox` package (a 0.x→1.x major bump). All workspace package.json peer deps and imports now use `typebox@^1.1.24` to keep nominal `TSchema`/`TUnsafe` types aligned with pi-ai's `StringEnum` helper. `@sinclair/typebox` removed from the allowlist; `typebox` added.
- **pnpm overrides moved from `package.json` `pnpm.overrides` to `pnpm-workspace.yaml` `overrides:`** (pnpm 10 ignores `pnpm.overrides` in package.json). Vulnerable transitive deps bumped to patched versions: `undici` ≥7.28.0, `ws` ≥8.21.0, `hono` ≥4.12.25, `protobufjs` ≥7.6.1, `vite` ≥8.0.16, `shell-quote` ≥1.8.4. CI compatibility matrix updated to `min-0.78.1` / `current-0.79.10`.
- **Extension event renames.** Upstream renamed `session_switch` → `session_before_switch` and `session_fork` → `session_before_fork`. All `pi.on(...)` registrations and test emissions across the repo were updated. The new `SessionBeforeSwitchEvent` requires a `reason` field and `SessionBeforeForkEvent` requires `entryId`/`position`; handlers return `void` (allowed by `ExtensionHandler<E, R = undefined>`).
- **`@monopi/extensions` aggregate removed.** Each former aggregate extension now ships as a standalone published package (`@monopi/extension-*`), while shared runtime helpers live in `@monopi/extension-shared`. The legacy `bg-process` compatibility shim is preserved as opt-in `@monopi/extension-bg-process`; the default bundle keeps `@monopi/background-tasks` instead.
- **`@monopi/themes` removed.** The JSON theme bundle is no longer published or installed by the default `@monopi/monopi` package; root pi metadata no longer registers repo-local themes.
- **Ollama hardcoded cloud fallback catalog removed.** `FALLBACK_OLLAMA_CLOUD_MODELS` is now empty. Cloud models come exclusively from live Ollama Cloud discovery (reloadable any time via `/ollama refresh-models`) and the persisted last-discovery cache. The pre-registration prime now uses `discoverOllamaCloudModels` (with per-model `/api/show`) instead of list-only `discoverOllamaCloudModelList`, so primed models carry accurate live metadata rather than stale hardcoded values.
- **`compat.reasoningEffortMap` migrated to model-level `thinkingLevelMap`.** Per upstream pi changes, the Ollama provider now sets `thinkingLevelMap` on reasoning models instead of the removed `compat.reasoningEffortMap` field.

## API fixes required by the version jump (0.64.0 → 0.79.10)

- `adaptive-routing`: removed dead `ModelRegistry.getApiKey(model)` branch (method removed upstream); now uses `getApiKeyForProvider` / `authStorage.getApiKey`.
- `cursor`: `StreamOptions.onPayload` now takes `(payload, model)`; call site and test updated to pass the model argument.
- `background-tasks`, `diagnostics`, `pi-bash-live-view`, `pi-remote-tailscale`, `subagents`, `plan`, `extensions` (scheduler, usage-tracker, watchdog, custom-footer, tool-metadata): `session_switch`/`session_fork` event handlers and test emissions migrated to the new `session_before_switch`/`session_before_fork` names.
- `shared-qna`: Bun global fallback path segment updated from `@earendil-works/pi-tui` to `@earendil-works/pi-tui`.

## Verification

- `pnpm test`: 144 files / 1343 tests passing (8 skipped).
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm mc:check`, and `pnpm mdt check`: clean.
- `node scripts/verify-pi-compat.mjs --version 0.79.10 --restore`: smoke tests pass against the latest upstream.
- `pnpm test:coverage` plus `pnpm tsx ./scripts/check-patch-coverage.ts --threshold 100 --lcov coverage/lcov.info`: patch coverage passes at 100%.

## Notes

- `@mariozechner/jiti` (used by `subagents` async execution) is a separate non-pi package and is intentionally left unchanged.
- `CHANGELOG.md` retains historical `@mariozechner/pi-*` references (historical record, not regenerated).