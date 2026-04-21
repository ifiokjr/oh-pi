---
default: minor
---

Remove explicit model override parameters from ant_colony tool. Model selection now uses adaptive routing exclusively — scouts, workers, and soldiers each use the best available model for their task category (quick-discovery, implementation-default, review-critical). Configure via /route settings.