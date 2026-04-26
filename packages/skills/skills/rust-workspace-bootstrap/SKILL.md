---
name: rust-workspace-bootstrap
description: Scaffold a production-ready Rust workspace with knope changesets, devenv, and GitHub Actions CI/release workflows. Use when starting a new Rust project or monorepo.
---

# Rust Workspace Bootstrap

Generate a Rust workspace template inspired by the release/devenv/workflow structure used in
`mdt` and `pina`.

## What it scaffolds

- Cargo workspace with `core` + `cli` crates
- `knope.toml` with:
  - `document-change`
  - `release`
  - `forced-release`
  - `publish`
- `.changeset/` folder for change files
- `devenv.nix`, `devenv.yaml`, `.envrc`
- GitHub Actions:
  - CI
  - coverage
  - semver checks
  - release preview
  - release assets
  - docs-pages deployment
- Opinionated defaults for `rustfmt`, `clippy`, `deny`, `dprint`

## Usage

```bash
# Minimal
{baseDir}/scaffold.js --name acme-tool

# Recommended (in a separate worktree)
git worktree add ../acme-tool -b feat/bootstrap-acme-tool
cd ../acme-tool
/path/to/rust-workspace-bootstrap/scaffold.js \
  --name acme-tool \
  --owner your-github-org \
  --repo acme-tool \
  --description "CLI + core Rust workspace"
```

## Options

- `--name <kebab-case>` (required)
- `--dir <path>` (optional, default: `./<name>`)
- `--owner <github-owner>` (optional, default: `your-github-org`)
- `--repo <github-repo>` (optional, default: `<name>`)
- `--description <text>` (optional)
- `--force` (optional, allow writing into non-empty directory)

## Rules

- Always use `_` (underscore) separators in Rust crate names.
- Do **not** use `-` in crate package names. Example: `acme_tool_core`, not `acme-tool-core`.

## After scaffolding

```bash
cd <project>

direnv allow
# or
# devenv shell

install:cargo:bin
build:all
lint:all
test:all
```

Create your first changeset:

```bash
knope document-change
```

Dry-run a release:

```bash
knope release --dry-run
```
