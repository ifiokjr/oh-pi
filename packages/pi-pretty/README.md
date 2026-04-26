# @ifi/pi-pretty

Pretty terminal output for pi built-in tools.

## Features

- **`read`** — Syntax-highlighted file content with line numbers + inline image rendering
- **`bash_pretty`** — Colored exit status with output preview
- **`ls`** — Tree-view directory listing with Nerd Font file type icons
- **`find`** / **`grep`** — FFF-backed frecency-aware search with grouped/highlighted rendering
- **`multi_grep`** — OR-search across multiple patterns

## Install

```bash
pi install npm:@ifi/pi-pretty
```

Or load locally:

```bash
pi -e ./packages/pi-pretty/index.ts
```

## Usage

Use the wrapped tools directly:

```text
read path="src/index.ts"
bash_pretty command="pnpm test"
ls path="src"
grep pattern="handleRequest" glob="*.ts"
```

## Commands

- `/fff-health` — Check FFF index status
- `/fff-rescan` — Force rescan of current directory
- `/multi-grep patterns=["foo","bar"] glob="*.ts"` — OR grep multiple patterns

## Configuration

| Environment variable       | Default       | Description                  |
| -------------------------- | ------------- | ---------------------------- |
| `PRETTY_THEME`             | `github-dark` | Shiki highlighting theme     |
| `PRETTY_MAX_HL_CHARS`      | `80000`       | Skip highlighting above this |
| `PRETTY_MAX_PREVIEW_LINES` | `80`          | Max lines in preview         |
| `PRETTY_CACHE_LIMIT`       | `128`         | LRU highlight cache size     |
| `PRETTY_ICONS`             | `nerd`        | Icon set (`nerd` or `none`)  |

## License

MIT — Ifiok Jr.
