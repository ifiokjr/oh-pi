---
name: git-workflow
description:
  Git workflow assistant for branching, commits, PRs, and conflict resolution. Use when user asks
  about git strategy, branch management, or PR workflow.
---

# Git Workflow

Help with Git operations and workflow best practices.

## Capabilities

### Branch Strategy

```bash
# Check current state
git branch -a
git log --oneline -20
git status
```

Recommend branching strategy based on project:

- **Solo**: main + feature branches
- **Team**: main + develop + feature/fix branches
- **Release**: GitFlow (main/develop/release/hotfix)

### Commit Messages

Follow Conventional Commits:

```
feat(scope): add new feature
fix(scope): fix bug description
refactor(scope): restructure code
docs(scope): update documentation
test(scope): add/update tests
chore(scope): maintenance tasks
```

### PR Workflow

1. `git diff main --stat` — Review changes
2. Generate PR title and description
3. Suggest reviewers based on changed files (`git log --format='%an' -- <files>`)

### Non-interactive safety for agent-run Git/GitHub commands

When **the agent** runs `git` or `gh`, avoid opening an interactive editor or prompt.

- For `git rebase --continue`, do **not** rely on `--no-edit` — `git rebase --continue` does not support it.
  Use one of these instead:
  ```bash
  GIT_EDITOR=true git rebase --continue
  # or
  git -c core.editor=true rebase --continue
  ```
- For commits, always pass the message on the command line:
  ```bash
  git commit -m "fix(scope): message"
  ```
- For merges that should reuse the existing message, use:
  ```bash
  git merge --no-edit
  ```
- For any other git command that could open an editor, set `GIT_EDITOR=true` for that invocation.
- For GitHub CLI commands, disable terminal prompts and provide all required fields explicitly:
  ```bash
  GH_PROMPT_DISABLED=1 gh pr create --title "..." --body "..."
  GH_PROMPT_DISABLED=1 gh pr merge --squash --delete-branch
  ```
- Only allow interactive editors/prompts when the user explicitly asks the agent to leave them enabled.

### Conflict Resolution

1. `git diff --name-only --diff-filter=U` — Find conflicted files
2. Read each conflicted file
3. Understand both sides of the conflict
4. Resolve with minimal changes preserving intent from both sides

### Interactive Rebase

Guide through `git rebase -i` for cleaning up history before PR.

If the agent is resolving conflicts during a rebase, continue with a non-interactive command such as:

```bash
GIT_EDITOR=true git rebase --continue
```
