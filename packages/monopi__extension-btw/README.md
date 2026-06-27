# @monopi/extension-btw

Standalone pi extension package for `btw` side conversations.

```bash
pi install npm:@monopi/extension-btw
```

## Commands

- `/btw` — open the side-chat overlay.
- `/btw <question>` — ask a side question without interrupting the main thread.

The side thread is persisted as custom session entries so it can be restored as the session tree changes.

## Attribution

This implementation is adapted from [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) `extensions/btw.ts`.
The adapted upstream code is Copyright Armin Ronacher and contributors and licensed under Apache-2.0.
Monopi package metadata and surrounding repository files remain MIT licensed.
