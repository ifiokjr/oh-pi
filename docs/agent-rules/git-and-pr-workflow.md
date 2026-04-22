# Git and PR Workflow

## Commits

Every commit must use conventional commits:

```text
type(scope)?: description
```

Use these types:

- `feat`
- `fix`
- `docs`
- `style`
- `refactor`
- `perf`
- `test`
- `build`
- `ci`
- `chore`
- `revert`

## Issue titles

Write issue titles in sentence case — capitalize only the first word and proper nouns.

- ✅ "Fix memory leak in usage tracker"
- ✅ "Support nested worktree paths on Windows"
- ❌ "Fix Memory Leak In Usage Tracker"
- ❌ "Support Nested Worktree Paths On Windows"

## Pull request titles

PR titles must follow conventional commits, just like commit messages:

```text
type(scope)?: description
```

- ✅ `feat(extensions): add context-aware rate limiting`
- ✅ `fix(ui): resolve race condition in footer render`
- ❌ `Add context-aware rate limiting`
- ❌ `Fixed bug with footer`

This keeps the commit history clean after squash merging and makes the PR list scannable.

## Branch hygiene

- Rebase onto `main` regularly while working to avoid falling behind and minimize merge conflicts.
- Before merging, always check the PR for merge conflicts.
- Handle merge conflicts with rebase before merging; do not resolve them with a merge commit.

## Merge policy

- Only use squash merging.

## Non-interactive Git/GitHub commands for agents

When the agent runs `git` or `gh`, prefer non-interactive invocations so an editor like Helix or Vim does not block the run.

- Do not assume `git rebase --continue` supports `--no-edit` — it does not.
- When continuing a rebase, use:
  ```bash
  GIT_EDITOR=true git rebase --continue
  ```
  or:
  ```bash
  git -c core.editor=true rebase --continue
  ```
- Always provide commit/tag/PR text explicitly on the command line when possible:
  - `git commit -m "..."`
  - `git tag -a vX.Y.Z -m "..."`
  - `gh pr create --title "..." --body "..."`
- Use `git merge --no-edit` when reusing the generated merge message.
- Run GitHub CLI commands with prompts disabled unless the user explicitly wants an interactive flow:
  ```bash
  GH_PROMPT_DISABLED=1 gh ...
  ```

## PR checks

- When you create or manage a PR, monitor failing or pending checks until they pass.
- Use the scheduler to follow up on PR checks while pi is idle.
- If checks fail, inspect the failure, fix it on the branch, push, and continue monitoring until the PR is green.

## CI shape

The CI pipeline runs these checks in parallel before `build`:

- conventional commit check
- changeset check
- security checks
- lint
- typecheck
- tests on Node 20 and Node 22

`build` runs after the required upstream checks pass.
