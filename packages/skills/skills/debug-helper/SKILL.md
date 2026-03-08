---
name: debug-helper
description: Debug assistant for error analysis, log interpretation, and performance profiling. Use when user encounters errors, crashes, or performance issues.
---

# Debug Helper

Systematic debugging workflow.

## Error Analysis

1. **Read the error** — Full stack trace and error message
2. **Locate** — Find the source file and line
   ```bash
   # Search for the error origin
   grep -rn "ErrorClass\|error_function" src/
   ```
3. **Context** — Read surrounding code (±30 lines)
4. **Reproduce** — Identify minimal reproduction steps
5. **Root cause** — Trace the data flow to find where it goes wrong
6. **Fix** — Minimal change that addresses the root cause
7. **Verify** — Run the failing case to confirm the fix

## Log Analysis

1. Read the log file or output
2. Identify patterns: timestamps, error levels, request IDs
3. Correlate events across log lines
4. Summarize: what happened, when, and why

## Performance Profiling

1. **Measure** — Get baseline numbers first
   ```bash
   time <command>
   ```
2. **Profile** — Use language-appropriate tools:
   - Node.js: `--prof`, `clinic.js`
   - Python: `cProfile`, `py-spy`
   - Go: `pprof`
3. **Identify** — Find the hotspot (usually 1-2 functions)
4. **Optimize** — Fix the bottleneck
5. **Verify** — Measure again, compare with baseline
