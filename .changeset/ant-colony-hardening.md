---
"@ifi/oh-pi-ant-colony": patch
"@ifi/oh-pi": patch
---

Harden and align ant-colony runtime behavior:

- fix final report signal emission to be status-aware (`COMPLETE` for success, failure status otherwise)
- replace raw drone shell execution with an allowlisted `execFileSync` command policy
- update `/colony-resume` to resume all resumable colonies by default when no ID is provided
- add stable colony ID tracking alongside runtime IDs and support both in status/stop command resolution
- share usage-limits tracker instances across runs to avoid listener buildup in runtimes without `off()`
- add integration tests for multi-colony command workflows and signal consistency
- refresh ant-colony README command and installation docs
