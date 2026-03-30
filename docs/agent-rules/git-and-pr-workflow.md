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

## Branch hygiene

- Rebase onto `main` regularly while working to avoid falling behind and minimize merge conflicts.
- Before merging, always check the PR for merge conflicts.
- Handle merge conflicts with rebase before merging; do not resolve them with a merge commit.

## Merge policy

- Only use squash merging.

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
