# Agent Rules — oh-pi

oh-pi is a lockstep-versioned pnpm monorepo of pi extensions, themes, prompts, skills, agents, and TUI tooling.

## Essentials

- Use `pnpm` for all workspace commands.
- Use `pnpm mdt ...` for MDT documentation reuse commands; do not rely on a globally installed `mdt` binary.
- Non-standard repo commands:
  - `pnpm typecheck` — type-checks the repo with `tsgo` (`@typescript/native-preview`)
  - `pnpm build` — builds the compiled packages (`@ifi/oh-pi-core` and `@ifi/oh-pi-cli`)
- Every non-release change must include a changeset created with `knope document-change`; changeset frontmatter must use only `default`.
- Documentation reuse is pinned to the workspace `@ifi/mdt` dependency; update provider/consumer blocks with `pnpm mdt update` and verify them with `pnpm mdt check`.
- Read only the detailed file that matches the current task:
  - [Engineering rules](docs/agent-rules/engineering.md)
  - [Packaging and release rules](docs/agent-rules/packaging-and-release.md)
  - [Git and PR workflow](docs/agent-rules/git-and-pr-workflow.md)
