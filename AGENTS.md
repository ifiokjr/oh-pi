# Agent Rules — oh-pi

oh-pi is a lockstep-versioned pnpm monorepo of pi extensions, themes, prompts, skills, agents, and TUI tooling.

## Essentials

- Use `pnpm` for all workspace commands.
- Non-standard repo commands:
  - `pnpm typecheck` — type-checks the repo with `tsgo` (`@typescript/native-preview`)
  - `pnpm build` — builds the compiled packages (`@ifi/oh-pi-core` and `@ifi/oh-pi-cli`)
- Every non-release change must include a changeset created with `knope document-change`; changeset frontmatter must use only `default`.
- Read only the detailed file that matches the current task:
  - [Engineering rules](docs/agent-rules/engineering.md)
  - [Packaging and release rules](docs/agent-rules/packaging-and-release.md)
  - [Git and PR workflow](docs/agent-rules/git-and-pr-workflow.md)
