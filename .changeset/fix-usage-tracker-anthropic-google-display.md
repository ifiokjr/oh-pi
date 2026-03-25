---
default: patch
---

Fix usage-tracker provider display regressions:

- Treat Anthropic OAuth `utilization` as percentage values (so `1.0` means 1% used, not 100% used).
- Preserve last known provider windows when transient probe responses report rate-limited/unavailable with no windows.
- For Google Cloud Code Assist tiers that explicitly state "unlimited", show a `Subscription quota` window at 100% instead of only showing "windows unavailable".
