# **PROJECT_TITLE**

**DESCRIPTION**

A Rust workspace starter inspired by the structure used in `mdt` and `pina`, with strong defaults for:

- **knope changeset + release workflows**
- **devenv/direnv reproducible environments**
- **GitHub Actions CI, coverage, semver, and release assets**

## Crate naming rule

Use underscores (`_`) in crate names, not hyphens (`-`).

## Workspace Layout

```
__PROJECT_NAME__/
├── crates/
│   ├── __CORE_CRATE__/    # shared library crate
│   └── __CLI_CRATE__/     # CLI crate (binary name: __PROJECT_NAME__)
├── .changeset/            # knope change files
├── .github/
│   ├── actions/devenv/
│   └── workflows/
├── docs/                  # mdBook docs source
├── scripts/release.sh
├── knope.toml
├── devenv.nix
└── Cargo.toml
```

## Quick Start

```bash
direnv allow
# or: devenv shell

install:cargo:bin
build:all
lint:all
test:all
```

## Changesets

Every change should include a change file:

```bash
knope document-change
```

Change types:

- `major` — breaking changes
- `minor` — new features
- `patch` — fixes/docs/refactors

## Release

Dry run:

```bash
knope release --dry-run
```

Full local release:

```bash
./scripts/release.sh
```

Publish:

```bash
knope publish
```
