---
default: minor
---

Add Pi Analytics Dashboard with SQLite persistence, real-time activity stream, and fun insights tracking.

New packages:
- `@ifi/pi-analytics-db`: Drizzle ORM schema + SQLite client for analytics data
- `@ifi/pi-analytics-dashboard`: React 19 + Vite 8 dashboard with Overview, Models, Codebases, and Insights pages
- `@ifi/pi-analytics-extension`: Pi extension that captures session/turn data and opens the dashboard

Features:
- 4 dashboard pages: Overview, Models, Codebases, Insights (emotions, words, misspellings)
- Express API server for real data mode (VITE_API_MODE=api)
- Mock data mode for development (VITE_API_MODE=mock, default)
- /analytics command for quick terminal stats
- /analytics-dashboard command to open in browser
- Emotional tone analysis, word frequency tracking, misspelling detection
- 47 Vitest unit tests + 73 Playwright E2E browser tests
- Zero lint warnings, clean build