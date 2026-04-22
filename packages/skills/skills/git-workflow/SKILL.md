---
name: git-workflow
description:
  Git workflow assistant for branching, commits, PRs, and conflict resolution. Use when user asks
  about git strategy, branch management, or PR workflow.
---

# Git Workflow

Help with Git operations and workflow best practices.

## Core Principles

### 1. Commit early and often

**Make small, frequent commits rather than accumulating large batches of changes.**

- Commit after every logical unit of work — even if it's just "wip: explore approach" or "wip: add failing test"
- A commit is cheap; losing work is expensive
- Small commits make reviews easier, bisection faster, and rollbacks safer
- Don't wait until everything is "perfect" — a messy commit history can be cleaned later with interactive rebase
- Prefer `git commit -m "wip: <description>"` over leaving work uncommitted for long stretches

### 2. Use `git stash` instead of discarding

**When you need to clear or reset uncommitted work, never just delete it — stash it with an explanation.**

- Use `git stash push -m "<reason>: <description>"` to preserve work and record *why* it was stashed
- The stash remains in Git history and can be recovered via `git stash list` or `git reflog`
- This protects against mistakes, dead ends that turn out to be useful later, or context lost during interruptions
- If you later decide the stashed work is truly worthless — only then drop it explicitly with `git stash drop <stash>`
- Explaining the stash in the message also helps future-you (or the next agent) understand what was happening

Example:
```bash
# Bad: work is just gone
rm -rf changed-files/
git checkout -- .

# Good: work is preserved with context
git stash push -m "pivot: abandoning approach A for approach B after benchmark regression"
git stash push -m "interrupted: switching to urgent bugfix PR #123"
```

### 3. Use worktrees for new work

**Start new work in a fresh worktree rather than working directly on `main` or the current branch.**

- Create a worktree for every distinct task or feature: `git worktree add -b feat/description ../worktrees/feat-description`
- Keeps `main` clean and available for quick reference, hotfixes, or parallel reviews
- Eliminates risk of accidentally committing work-in-progress to the trunk
- Makes it safe to run tests, builds, and linting in isolation without polluting the main checkout
- When done, remove the worktree: `git worktree remove <path>` — the branch remains for PR/merge
- If the repo has the oh-pi worktree extension, prefer `/worktree create --purpose "..."`

### 4. Clean up history before sharing

**Never merge or push to `origin` while `wip:` commits remain in the stack, unless the user explicitly says otherwise.**

- WIP commits are for *local* iteration only — they are checkpoints, not publication-ready units
- Before pushing or opening a PR, restructure history so every commit is a logical, self-contained unit of work
- Each commit should tell a clear story: what changed, why it changed, and ideally be independently buildable/testable
- Squash related `wip:` commits using interactive rebase: `git rebase -i main`
- Rename `wip:` commits to proper Conventional Commit messages that describe the final intent
- If a commit cannot stand on its own (e.g. "wip: broken test"), squash it into the commit that makes it pass
- Only ever push `wip:` commits to `origin` if the user explicitly requests it (e.g. "just push what I have")

Example — cleaning up before a PR:
```bash
# Check what's in the stack
git log --oneline main..HEAD

# If there are wip: commits, restructure
git rebase -i main
#   pick    feat(widget): add new rendering pipeline
#   squash  wip: failing test for edge case
#   squash  wip: fix off-by-one in renderer
#   pick    perf(widget): cache computed layout
#   drop    wip: try alternative approach (abandoned)

# Push the cleaned branch
git push origin feat/widget-rendering
```

See also [Core Principle #1: Commit early and often](#1-commit-early-and-often) — commit freely with `wip:` during development, but clean up before sharing.

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

### Worktree-aware workflow

When the repository uses git worktrees, do not assume the current checkout is the main repo root.
First establish:

```bash
git rev-parse --show-toplevel
git rev-parse --git-common-dir
git worktree list --porcelain
```

**Prefer worktrees for all new work.** See [Core Principle #3: Use worktrees for new work](#3-use-worktrees-for-new-work).

If the oh-pi worktree extension is available, prefer:

- `/worktree status` — show the current worktree, canonical repo root, and pi ownership metadata
- `/worktree list` — show all repo worktrees and which ones are pi-owned vs external/manual

For pi-owned worktrees:

- always record a human-readable purpose when creating one
- preserve the owner/session metadata so cleanup decisions stay explainable
- only clean up pi-owned worktrees by default
- do **not** clean external/manual worktrees unless the user explicitly asks

When finishing work in a worktree:
1. Push the branch: `git push origin <branch>`
2. Open a PR from the worktree branch
3. Remove the worktree after merge: `git worktree remove <path>`

### Commit Messages

Follow Conventional Commits

Small commits are better than perfect commits. See [Core Principle #1: Commit early and often](#1-commit-early-and-often).

Use these prefixes:

```
feat(scope): add new feature
fix(scope): fix bug description
refactor(scope): restructure code
docs(scope): update documentation
test(scope): add/update tests
chore(scope): maintenance tasks
```

For work-in-progress commits (which are encouraged!), use `wip:` prefix or `chore(wip):`:

```bash
git commit -am "wip: explore trie-based approach for tokenization"
git commit -am "wip: failing test for edge case in parser"
git commit -am "wip: checkpoint before attempting refactor"
```

Clean up before opening a PR:
```bash
git rebase -i main  # squash related wip commits
```

But **never leave work uncommitted for long** — stash or commit, don't let it sit dirty.

### PR Workflow

1. `git diff main --stat` — Review changes
2. Generate PR title and description
3. Suggest reviewers based on changed files (`git log --format='%an' -- <files>`)

### PR link in summaries

When a PR has been opened, **always include the full GitHub PR URL** in any summary or status update you provide. This makes it easy for the user to click through to the PR directly.

Example summary format:

```
PR: https://github.com/owner/repo/pull/42
```

Use `gh pr view --json url --jq .url` to retrieve the URL if you do not already have it.

### Non-interactive safety for agent-run Git/GitHub commands

When **the agent** runs `git` or `gh`, avoid opening an interactive editor or prompt.

A lot of Git entrypoints use different editor config keys, so avoid surprises by disabling both:

- `core.editor` / `GIT_EDITOR` (commit, merge, tag message editing)
- `sequence.editor` / `GIT_SEQUENCE_EDITOR` (interactive rebase todo-list editing)

Use this pattern for non-interactive flows:

```bash
GIT_EDITOR=true GIT_SEQUENCE_EDITOR=true git -c core.editor=true -c sequence.editor=true rebase --continue
```

- For commits, always pass the message on the command line:
  ```bash
  git commit -m "fix(scope): message"
  ```
- For merges that should reuse the existing message, use:
  ```bash
  git merge --no-edit
  ```
- For any other git command that could open an editor, set `GIT_EDITOR=true` and `GIT_SEQUENCE_EDITOR=true` (plus `-c core.editor=true -c sequence.editor=true`) for that invocation.
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
GIT_EDITOR=true GIT_SEQUENCE_EDITOR=true git -c core.editor=true -c sequence.editor=true rebase --continue
```
