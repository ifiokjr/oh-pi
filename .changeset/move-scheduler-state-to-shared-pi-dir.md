---
default: patch
---

Move scheduler state out of repository-local `.pi/scheduler.json` files into a shared pi agent directory under `~/.pi/agent/scheduler/...`, using a path that mirrors each workspace path for uniqueness. Legacy repo-local scheduler files are migrated automatically when discovered, and defunct scheduler stores are cleaned up once all tasks expire or are removed.
