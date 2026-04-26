---
name: devenv
description: Use devenv as the task runner and development environment when devenv.nix is present in the
  project. Run scripts via `devenv test` to enter the shell, or `devenv shell <command>` when
  commands aren't available outside the shell. Prefer devenv scripts over ad-hoc commands. Use when
  devenv.nix exists, or when the user asks about devenv setup, scripts, processes, or Nix-based
  dev environments.
---

# devenv Skill

## Activation

Load this skill when `devenv.nix` exists in the project root, or when the user mentions devenv,
Nix shells, or project task runners.

## Quick start

```bash
# Enter the development shell (sets up PATH, env, git hooks)
devenv test

# Run a one-off command inside the shell
devenv shell <command>

# Run a named script
devenv shell <script-name>
# Example: devenv shell lint:all
```

## Core rules

1. **Prefer devenv scripts over raw commands.** When a `scripts` block exists in `devenv.nix`,
   always use the script name instead of the underlying command.

   ```bash
   # ✅ Preferred
   devenv shell lint:all
   devenv shell test:all

   # ❌ Avoid
   cargo clippy --workspace --all-features -- -D warnings
   pnpm test
   ```

2. **Use `devenv shell <command>` when direct commands fail.** If `pnpm`, `cargo`, or other
   project tools are not on PATH, prefix with `devenv shell`:

   ```bash
   devenv shell pnpm install
   devenv shell cargo build --workspace
   ```

3. **Use `devenv test` to enter the shell** for interactive work or to verify the environment
   is correctly set up.

4. **Check `devenv.nix` scripts before inventing commands.** Always read the `scripts` block to
   find existing task names before running raw commands.

## Common patterns

### Running project tasks

```bash
devenv shell build:all       # Build everything
devenv shell test:all        # Run all tests
devenv shell lint:all        # Run all lints
devenv shell fix:all         # Fix all autofixable problems
devenv shell docs:check      # Check documentation
devenv shell docs:update     # Update shared docs
```

### Managing the environment

```bash
devenv test                  # Enter the shell (sets up env + hooks)
devenv update                # Update flake inputs
devenv gc                    # Garbage collect old generations
```

### Running processes

```bash
devenv up                    # Start all processes (postgres, redis, etc.)
devenv processes status      # Check running processes
```

## When scripts aren't on PATH

Some devenv configurations set `enterShell` to add scripts to PATH via:

```nix
enterShell = ''
  export PATH="$DEVENV_ROOT/scripts:$PATH"
'';
```

In those cases, scripts may be available directly inside `devenv test`. Outside the shell, always
use `devenv shell <script-name>`.

## Script naming conventions

The user's preferred `devenv.nix` layout uses colon-separated namespaced scripts:

- `build:*` — build tasks
- `test:*` — test tasks
- `lint:*` — lint and check tasks
- `fix:*` — autofix tasks
- `install:*` — dependency installation tasks
- `update:*` — update tasks
- `docs:*` — documentation tasks
- `coverage:*` — coverage tasks
- `snapshot:*` — snapshot update/review tasks
- `setup:*` — editor/tool setup tasks
- `clean:*` — cleanup tasks
- `deny:check` — security/license checks
- `publish:check` — publication dry-run checks

## See also

For the recommended `devenv.nix` layout, script structure, and git-hooks configuration, see
[REFERENCE.md](REFERENCE.md).
