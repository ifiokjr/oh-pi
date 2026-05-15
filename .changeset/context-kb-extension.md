---
"@ifi/oh-pi": minor
"@ifi/oh-pi-agents": minor
"@ifi/oh-pi-cli": minor
"@ifi/oh-pi-context": minor
"@ifi/oh-pi-core": minor
"@ifi/oh-pi-docs": minor
"@ifi/oh-pi-extensions": minor
"@ifi/oh-pi-prompts": minor
"@ifi/oh-pi-skills": minor
"@ifi/oh-pi-themes": minor
"@ifi/pi-analytics-dashboard": minor
"@ifi/pi-analytics-db": minor
"@ifi/pi-analytics-extension": minor
"@ifi/pi-background-tasks": minor
"@ifi/pi-bash-live-view": minor
"@ifi/pi-diagnostics": minor
"@ifi/pi-extension-adaptive-routing": minor
"@ifi/pi-extension-subagents": minor
"@ifi/pi-plan": minor
"@ifi/pi-pretty": minor
"@ifi/pi-provider-catalog": minor
"@ifi/pi-provider-cursor": minor
"@ifi/pi-provider-ollama": minor
"@ifi/pi-remote-tailscale": minor
"@ifi/pi-shared-qna": minor
"@ifi/pi-spec": minor
"@ifi/pi-web-client": minor
"@ifi/pi-web-remote": minor
"@ifi/pi-web-server": minor
---

# Context Knowledge Base Extension

Add `@ifi/oh-pi-context` — a Pi-native context manager with SQLite FTS5 knowledge base, session indexing, BM25 search, terse mode, and context-window analytics.

This package provides a Pi extension that indexes session messages into a local SQLite database with FTS5 full-text search, enabling cross-session context retrieval without relying on external MCP servers.

## Features

- **`/ctx:index`** — Manually index all messages in the current session.
- **`/ctx:search <query>`** — BM25 keyword search scoped to the current project.
- **`/ctx:terse [on|off]`** — Toggle terse-output mode.
- **`/ctx:stats`** — Show knowledge base statistics.
- **`/ctx:purge`** — Delete all indexed entries.

## Architecture

- SQLite DB stored at `~/.pi/context-kb/sessions.db` (WAL mode)
- Optional dependency on `better-sqlite3`; graceful degradation if missing
- Session entries indexed on demand; no invasive postinstall hooks

## Testing

- Store module tests with real SQLite FTS5 queries
- Extension registration smoke tests

## Security

- Only reads/writes `~/.pi/context-kb/` — no home-directory symlinks, no monkey-patching, no arbitrary code execution.
