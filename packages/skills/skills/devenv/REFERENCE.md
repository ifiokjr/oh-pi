# devenv Reference

## Recommended `devenv.nix` layout

This is the preferred structure, adapted from the monochange project. Adjust packages,
scripts, and hooks for each project's needs.

```nix
{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:

let
  extra = inputs.ifiokjr-nixpkgs.packages.${pkgs.stdenv.system};
in
{
  packages =
    with pkgs;
    [
      # Add project-specific packages here
    ]
    ++ lib.optionals stdenv.isDarwin [
      coreutils
    ];

  enterShell = ''
    # Keep shell entry fast. Only bootstrap missing toolchains here;
    # explicit updates happen via install/update tasks instead of every shell.
    export PATH="$DEVENV_ROOT/scripts:$PATH"
  '';

  # Disable dotenv if using direnv
  dotenv.disableHint = true;

  git-hooks = {
    hooks = {
      # Add pre-commit and pre-push hooks here
    };
  };

  scripts = {
    # Colon-namespaced scripts: build:*, test:*, lint:*, fix:*, etc.
    "build:all" = {
      exec = ''
        set -e
        # Project-specific build commands
      '';
      description = "Build everything.";
      binary = "bash";
    };

    "test:all" = {
      exec = ''
        set -e
        # Project-specific test commands
      '';
      description = "Run all tests.";
      binary = "bash";
    };

    "lint:all" = {
      exec = ''
        set -e
        # Project-specific lint commands
      '';
      description = "Run all checks.";
      binary = "bash";
    };

    "fix:all" = {
      exec = ''
        set -e
        # Project-specific autofix commands
      '';
      description = "Fix all autofixable problems.";
      binary = "bash";
    };

    "docs:check" = {
      exec = ''
        set -e
        mdt check
      '';
      description = "Check that shared documentation blocks are synchronized.";
      binary = "bash";
    };

    "docs:update" = {
      exec = ''
        set -e
        mdt update
      '';
      description = "Update shared documentation blocks.";
      binary = "bash";
    };
  };
}
```

## Script definition options

Each script in the `scripts` block accepts:

| Field | Required | Description |
|-------|----------|-------------|
| `exec` | Yes | Shell command body. Use `"$@"` to forward arguments. |
| `description` | Recommended | Short description shown by `devenv scan`. |
| `binary` | Optional | Shell binary (default: `bash`). |

## Key variables available in `exec`

- `$DEVENV_ROOT` — project root directory
- `$DEVENV_PROFILE` — path to the devenv profile (contains `bin/`)
- `$PWD` — current working directory

## `enterShell` best practices

- Keep it fast. Avoid expensive operations like full installs.
- Only bootstrap missing toolchains (e.g. `rustup toolchain list | grep`).
- Add custom script directories to PATH: `export PATH="$DEVENV_ROOT/scripts:$PATH"`.
- Shell activation happens on every `devenv test` or `direnv` reload.

## Git hooks in devenv

Git hooks are defined under `git-hooks.hooks`. Each hook accepts:

| Field | Description |
|-------|-------------|
| `enable` | Whether the hook is active |
| `verbose` | Print hook output |
| `pass_filenames` | Pass staged filenames to the entry command |
| `name` | Display name |
| `description` | What the hook does |
| `entry` | Command to run (can reference `${pkgs.tool}/bin/tool`) |
| `stages` | `pre-commit` or `pre-push` |

### Common hook patterns

```nix
"lint:all" = {
  enable = true;
  verbose = true;
  pass_filenames = false;
  name = "lint and test";
  description = "Run lint and test before push.";
  entry = "${config.env.DEVENV_PROFILE}/bin/lint:all && ${config.env.DEVENV_PROFILE}/bin/test:all";
  stages = [ "pre-push" ];
};

"gitleaks" = {
  enable = true;
  verbose = true;
  pass_filenames = true;
  name = "secrets";
  description = "Scan for leaked secrets.";
  entry = "${pkgs.gitleaks}/bin/gitleaks protect --staged --verbose --redact";
  stages = [ "pre-commit" ];
};
```

## Processes and services

devenv can manage background processes:

```nix
processes = {
  server.exec = "cargo run --bin my-server";
};

services.postgres = {
  enable = true;
  package = pkgs.postgresql_16;
  initialDatabases = [{ name = "myapp"; }];
};
```

Run with:

```bash
devenv up            # Start all processes and services
```

## `devenv.yaml` inputs

Use `devenv.yaml` to declare external flake inputs:

```yaml
inputs:
  nixpkgs:
    url: github:NixOS/nixpkgs/nixpkgs-unstable
  ifiokjr-nixpkgs:
    url: github:ifiokjr/nixpkgs
```

Then reference them in `devenv.nix` as `inputs.ifiokjr-nixpkgs.packages.${pkgs.stdenv.system}`.

## Common commands reference

| Command | Purpose |
|---------|---------|
| `devenv test` | Enter the development shell |
| `devenv shell <cmd>` | Run a single command in the shell |
| `devenv up` | Start processes and services |
| `devenv update` | Update flake inputs |
| `devenv gc` | Garbage collect old generations |
| `devenv processes status` | Show running processes |
| `devenv scan` | List available scripts |

## Troubleshooting

### Command not found outside the shell

If `pnpm`, `cargo`, or other tools are not available on your system PATH, always prefix:

```bash
devenv shell pnpm install
devenv shell cargo build
```

### Stale environment

```bash
devenv test   # Re-enters the shell, re-evaluating enterShell
```

### Shell activation is slow

Check that `enterShell` doesn't run expensive operations. Move one-time setup into named
scripts like `install:toolchains` instead.