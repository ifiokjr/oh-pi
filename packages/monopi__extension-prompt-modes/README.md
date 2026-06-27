# @monopi/extension-prompt-modes

Standalone pi extension package for `prompt-modes` — switch between prompt/model configurations.

```bash
pi install npm:@monopi/extension-prompt-modes
```

## Commands

- `/mode` — open the mode selector.
- `/mode <name>` — apply a named mode (sets model, thinking level, and system prompt overrides).
- `/mode store [name]` — store the current selection into a named mode.

## Shortcuts

- `ctrl+shift+m` — open the mode selector.
- `ctrl+space` — cycle/quick select.

Modes are persisted to a project modes file (falling back to a global file) so they survive across sessions.

## Attribution

This implementation is adapted from [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) `extensions/prompt-editor.ts`.
The adapted upstream code is Copyright Armin Ronacher and contributors and licensed under Apache-2.0.
Monopi package metadata and surrounding repository files remain MIT licensed.
