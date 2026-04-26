---
name: web-search
description: Web search via DuckDuckGo. Use when the user needs to look up current information online.
---

# web-search

Web search via DuckDuckGo. Use when the user needs to look up current information online.

## Usage

```bash
{baseDir}/search.js "query terms"
{baseDir}/search.js -n 10 "query terms"
```

- `-n <count>` — number of results to return (default: 5)
- Returns title, URL, and snippet for each result.
