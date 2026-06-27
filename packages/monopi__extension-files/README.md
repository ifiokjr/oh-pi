# @monopi/extension-files

Standalone pi extension package for `files` — file browser with git status and session references.

```bash
pi install npm:@monopi/extension-files
```

## Commands

- `/files` — browse files in the current git tree plus session-referenced files, with quick actions (reveal, open, edit, diff).

## Shortcuts

- `ctrl+shift+o` — browse files mentioned in the session.
- `ctrl+shift+f` — reveal the latest file reference in Finder.
- `ctrl+shift+r` — reveal the latest file reference in the default file manager.

## Attribution

This implementation is adapted from [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) `extensions/files.ts`.
The adapted upstream code is Copyright Armin Ronacher and contributors and licensed under Apache-2.0.
Monopi package metadata and surrounding repository files remain MIT licensed.
