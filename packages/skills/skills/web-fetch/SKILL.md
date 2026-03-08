---
name: web-fetch
description: Fetch a web page and extract readable text content. Use when user needs to retrieve or read a web page.
---

# web-fetch

Fetch a web page and extract readable text content.

## Usage

```bash
{baseDir}/fetch.js <url> [--raw]
```

- `<url>` — URL to fetch
- `--raw` — Output raw HTML instead of extracted text

## Examples

```bash
{baseDir}/fetch.js https://example.com
{baseDir}/fetch.js https://example.com --raw
```
