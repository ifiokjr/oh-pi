---
default: patch
---

Fix tool name conflict between bg-process and background-tasks extensions.

The bg-process extension in the extensions package re-exports the same
extension from @ifi/pi-background-tasks, causing "Tool bash conflicts with
bg-process" errors. Replaced the redundant bg-process.ts entry in the root
pi.extensions config with a direct reference to the background-tasks package,
eliminating the double-loading conflict.