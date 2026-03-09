---
"@ifi/oh-pi-skills": minor
"@ifi/oh-pi": minor
---

Add a new `rust-workspace-bootstrap` skill that scaffolds a Rust workspace template inspired by `mdt` and `pina`, including:

- knope changeset + release workflows
- devenv/direnv setup with common Rust scripts
- GitHub Actions for CI, coverage, semver checks, release preview, and release assets
- core + CLI crate starter structure
- enforced crate naming convention using underscores (`_`) instead of hyphens (`-`)
