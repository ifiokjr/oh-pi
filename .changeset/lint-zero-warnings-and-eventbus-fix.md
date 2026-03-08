---
default: patch
---

### Zero-warning lint baseline + fail on warnings

- Fixed all Biome warnings across the repo (0 warnings, 0 errors).
- Updated lint commands to fail on warnings:
  - `pnpm lint` now runs `biome check --error-on-warnings .`
  - `pnpm check` now runs `biome ci --error-on-warnings .`
- Updated CI lint job to enforce `--error-on-warnings`.

### Ant colony runtime fix: event bus compatibility

Fixed colony failures in environments where `pi.events.off` is not implemented.

- `ColonyEventBus.off` is now optional.
- Added `createUsageLimitsTracker()` to safely query usage-tracker limits with
  support for both `on/emit/off` and `on/emit` event buses.
- Prevents `TypeError: opts.eventBus.off is not a function` during colony runs.
- Added regression tests for event buses with and without `off()`.
