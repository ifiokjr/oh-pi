# @ifi/oh-pi-context

Pi-native context manager: SQLite FTS5 knowledge base, terse mode, and context-window analytics.

## Features

- **Session Knowledge Base** — Index every user, assistant, and tool message into a local SQLite database with FTS5 full-text search.
- **BM25 Search** — Query past sessions by keyword, scoped to the current project directory.
- **Auto-Indexing** — On session shutdown, all messages are automatically indexed.
- **Manual Control** — `/ctx:index`, `/ctx:search`, `/ctx:stats`, `/ctx:purge`.
- **Terse Mode** — Toggle a terse-output mode that reminds the LLM to be brief.

## Commands

| Command                | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `/ctx:index`           | Index all messages in the current session into the knowledge base.  |
| `/ctx:search <query>`  | BM25 search across indexed sessions, scoped to the current project. |
| `/ctx:terse [on\|off]` | Toggle terse mode (or toggle if no arg).                            |
| `/ctx:stats`           | Show knowledge base statistics.                                     |
| `/ctx:purge`           | Delete all entries from the knowledge base.                         |

## Storage

The SQLite database lives at `~/.pi/context-kb/sessions.db` and uses WAL mode for safe concurrent access. It is **not** tracked by Git.

## Optional Dependency

`better-sqlite3` is an optional dependency. If it is not installed, the extension degrades gracefully — `/ctx:index` will silently no-op and search commands will show a friendly warning.

## Installation

Add to your pi `settings.json`:

```json
{
	"extensions": ["@ifi/oh-pi-context"]
}
```

Or install the package in your workspace and let Pi discover it automatically via the `pi.extensions` field in `package.json`.
