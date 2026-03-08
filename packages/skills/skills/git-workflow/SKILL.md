---
name: git-workflow
description: Git workflow assistant for branching, commits, PRs, and conflict resolution. Use when user asks about git strategy, branch management, or PR workflow.
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

### Conflict Resolution
1. `git diff --name-only --diff-filter=U` — Find conflicted files
2. Read each conflicted file
3. Understand both sides of the conflict
4. Resolve with minimal changes preserving intent from both sides

### Interactive Rebase
Guide through `git rebase -i` for cleaning up history before PR.
