# 2-Minute Demo Script (oh-pi + ant-colony)

> Goal: Help first-time users understand within 2 minutes:
>
> 1. oh-pi is the one-command setup entry;
> 2. ant colony is an optional advanced capability;
> 3. when using ant colony is worth it.

## Scene Setup (before recording)

- A clean terminal window
- A medium-complexity repository (at least 3 related files)
- Node 20+ installed

## Timeline

### 0:00 - 0:25 | One-command setup

```bash
npx oh-pi
```

Narration:

- "You don’t need to understand the architecture first — just get pi configured."
- "oh-pi is the entry point: it installs provider, theme, and extensions in one go."

### 0:25 - 0:45 | Start pi

```bash
pi
```

Narration:

- "Now it’s ready to use. Even without complex operations, you can start coding immediately."

### 0:45 - 1:30 | Trigger ant colony for a complex task

Example goal:

- "Scan the repository, add one refactor plan document, only modify one file under docs, then review
  output quality."

What to watch:

- `COLONY_SIGNAL:SCOUTING`
- (if needed) `COLONY_SIGNAL:PLANNING_RECOVERY`
- `COLONY_SIGNAL:WORKING`
- `COLONY_SIGNAL:TASK_DONE`
- `COLONY_SIGNAL:COMPLETE`

Narration:

- "Use ant colony for complex tasks. It’s not worth invoking for tiny single-file edits."
- "If scout output is unstable, it enters a recovery loop instead of crashing immediately."

### 1:30 - 2:00 | Results and boundaries

Narration:

- "You get both the result and process signals — not a black box."
- "Good fit for ant colony: multi-file, parallelizable, review-heavy tasks."
- "Not a good fit: tiny single-file tweaks or low-complexity work."

## Closing line (ready to read)

"oh-pi first solves usability, then ant colony solves complex-task efficiency. Nail the entry
experience first, then gradually unlock advanced capabilities."
