---
default: minor
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
