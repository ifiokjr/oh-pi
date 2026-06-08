---
default: patch
---

# Remove session resume hint messages

## Fixed

- Stopped the auto session name extension from emitting `[session-resume-hint]` messages during session switch and shutdown events.
