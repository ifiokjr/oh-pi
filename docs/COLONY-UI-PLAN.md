# Colony UI Improvement Plan (Phase A.5)

> Background: The colony functionality works, but the visualization layer lacks information hierarchy and readability, hurting "first-glance value perception."

## 1) Completed Quick Wins

- Status bar: added phase label (`SCOUTING/WORKING/...`) and progress percentage.
- Status bar: added active ant count (`⚡N`).
- `/colony-status` text: added progress bar, phase details, and most recent event.
- Details panel header: phase label + task progress + percentage + active ants + progress bar.
- Details panel: "Active Ant Streams" list (role icon + antId + token count + latest output summary).
- Details panel: "Recent Signals" section (last 6 signal log entries).
- Details panel: "Warnings" section (quick focus on failed tasks).
- `ant-colony-progress` messages: custom rendering to reduce text noise and unify phase labels.

## 2) Next Optimizations (by priority)

### P1: Information Architecture
- [x] Unify the "primary info quartet": Phase / Progress / Cost / Time.
- [ ] Pin errors and budget-exceeded warnings to a top alert area (prevent them from being buried in task lists).

### P2: Interaction Experience
- [x] Add details panel pagination (Tasks / Streams / Log).
- [x] Support filtering tasks by status (done/active/failed/all).

### P3: Visual Consistency
- [x] Unify signal text and UI label naming (e.g. display text for `PLANNING_RECOVERY` / `BUDGET_EXCEEDED`).
- [x] Complete round-1 theme contrast audit and converge color tier usage (see `docs/COLONY-UI-CONTRAST-AUDIT.md`).

## 3) Acceptance Criteria

- New users can answer within 10 seconds:
  1) What phase is the colony in?
  2) How many tasks are complete?
  3) Are there any failures?
- `/colony-status` allows judging whether the colony is stuck without reading logs.
- Details panel shows "what active ants are currently outputting."

## 4) Non-Goals

- No scheduler logic refactoring in this phase.
- No new state machines in this phase.
- No cross-process visualization sync protocol changes in this phase.
