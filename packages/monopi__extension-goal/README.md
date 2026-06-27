# @monopi/extension-goal

Standalone pi extension package for `goal` — session-log-backed long-running objective tracking.

```bash
pi install npm:@monopi/extension-goal
```

## Commands

- `/goal <objective>` — start (or replace) the active thread goal.
- `/goal` — show the current goal summary.
- `/goal edit` — edit the objective interactively.
- `/goal pause` / `/goal resume` — pause or resume the active goal.
- `/goal clear` — clear the current goal.

## Tools

- `get_goal` — read the current goal and its usage/budget state.
- `create_goal` — create a new active goal when explicitly requested.
- `update_goal` — mark the active goal `complete` or `blocked` after verifying the required conditions.

State is persisted as custom session entries and reconstructed on reload/tree navigation.

## Attribution

This implementation is adapted from [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) `extensions/goal.ts`.
The adapted upstream code is Copyright Armin Ronacher and contributors and licensed under Apache-2.0.
Monopi package metadata and surrounding repository files remain MIT licensed.
