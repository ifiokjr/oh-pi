---
name: context7
description: Search and query up-to-date documentation for any programming library via Context7 API. Use when you need current docs, code examples, or API references for libraries and frameworks.
---

# Context7

Search for libraries and query their documentation via the Context7 API.

## Search Libraries

```bash
{baseDir}/search.js "library name" "what you need help with"
```

Example:
```bash
{baseDir}/search.js "react" "hooks for state management"
```

Returns matching libraries with Context7-compatible IDs for use with the docs tool.

## Query Documentation

```bash
{baseDir}/docs.js "/org/project" "your question"
```

Example:
```bash
{baseDir}/docs.js "/websites/react_dev" "useEffect cleanup"
```

Use the library ID from search results. Returns relevant documentation and code examples.
