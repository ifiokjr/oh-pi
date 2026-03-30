---
default: patch
---

reduce long-session input lag by avoiding footer rescans, adding a performance watchdog, and introducing a safe mode command that suppresses nonessential UI chrome when the session gets sluggish.
