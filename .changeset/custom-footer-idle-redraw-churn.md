---
default: patch
---

Reduce custom-footer idle redraw churn by letting the PR poll timer probe for changed PR state without forcing a footer rerender every minute when the visible footer content is unchanged.
