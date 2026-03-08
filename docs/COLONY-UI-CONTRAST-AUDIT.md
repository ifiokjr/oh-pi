# Colony UI Contrast Audit (Round 1)

> Goal: Prevent critical information from using overly dark color tiers that become "hard to read, hard to find."

## 1) Color Tier Semantics (Unified Standard)

- `text`: Primary information (phase, task titles, log body)
- `muted`: Secondary information (goal summaries, timestamps, helper text)
- `dim`: Weak hints (decorative symbols, very low-priority metadata)

Conclusion: **Critical status and progress no longer use `dim`.**

---

## 2) Changes in This Round

File: `pi-package/extensions/ant-colony/index.ts`

Adjusted:
- Report task lines: `dim` → `muted`
- Active Streams antId: `dim` → `muted`
- Recent Signals age timestamps: `dim` → `muted`
- Goal and summary in tool call/launch results: `dim` → `muted`

Kept `dim` for:
- Pending task dots `○` in task lists
- Task duration suffixes

Rationale: These are "nice to see but not critical" weak hints that don't affect primary judgment.

---

## 3) Acceptance Criteria

- User can identify phase, progress, and failure status within 3 seconds.
- On dark themes, status bars are readable without squinting.
- `dim` no longer carries core semantic meaning.

---

## 4) Follow-Up (Round 2)

- Screenshot-based manual inspection across six themes (oh-pi Dark / Cyberpunk / Nord / Catppuccin / Tokyo Night / Gruvbox).
- If a theme's `muted` is still too dark, consider forcing `text` for critical lines within the extension.
