# Pi Analytics Dashboard

Comprehensive usage analytics for your Pi AI assistant, featuring beautiful visualizations, detailed insights, and persistent SQLite storage.

![Pi Analytics Dashboard](docs/dashboard-preview.png)

## Features

### 📊 Visualizations

- **Time Series Charts** - Track usage over time with interactive area charts
- **Pie Charts** - Cost breakdown by model, provider, and type
- **Horizontal Bar Charts** - Rankings of top models and codebases
- **Activity Heatmap** - GitHub-style contribution grid showing when you're most active
- **Metric Cards** - Quick overview of key statistics with trend indicators

### 🔍 Analytics

- **Model Analytics** - See which models you use most, their costs, and performance
- **Provider Comparison** - Compare usage across Anthropic, OpenAI, Google, and Ollama
- **Codebase Tracking** - Know which projects use the most tokens
- **Cost Breakdown** - Understand where your money goes

### 📅 Time Ranges

- Quick selectors: 7D, 30D, 90D, 1Y, All
- Automatic aggregation by day, week, or month based on range
- Persistent date range preference

### 💾 Data Storage

- **SQLite Database** - Local, fast, persistent storage
- **Automatic Aggregations** - Daily stats computed automatically
- **Historical Data** - Rollback to any point in time

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Pi Analytics Dashboard                    │
├─────────────────────────────────────────────────────────────┤
│  Vite 8 + React 19 + TypeScript + Tailwind CSS v4          │
│  Recharts · TanStack Query · Zustand · Lucide Icons        │
└──────────────────────┬──────────────────────────────────────┘
│                      │                                      │
┌──────────────────────┴──────────────────────────────────────┐
│                   @oh-pi/analytics-db                       │
├─────────────────────────────────────────────────────────────┤
│  Drizzle ORM · better-sqlite3 · Migration System           │
└──────────────────────┬──────────────────────────────────────┘
│                      │                                      │
┌──────────────────────┴──────────────────────────────────────┐
│                   Pi Extension Layer                        │
├─────────────────────────────────────────────────────────────┤
│  Session Tracking · Turn Recording · Auto-aggregation        │
└─────────────────────────────────────────────────────────────┘
```

## Development

### Install dependencies

```bash
pnpm install
```

### Run development server

```bash
pnpm dev
```

The dashboard will be available at `http://localhost:31415`

### Build for production

```bash
pnpm build
```

### Run tests

```bash
# Unit tests with Vitest
pnpm test

# E2E tests with Playwright
pnpm test:e2e

# E2E with UI mode
pnpm test:e2e:ui
```

## Configuration

The dashboard automatically connects to your Pi analytics database at:

```
~/.pi/analytics/analytics.db
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search/filter |
| `Cmd/Ctrl + B` | Toggle sidebar |
| `1-5` | Switch time range (7D, 30D, 90D, 1Y, All) |

## Screenshots

### Overview Dashboard

The main dashboard features a comprehensive overview with metric cards, usage over time charts, cost breakdown, top models, codebases, activity heatmap, and AI-generated insights.

Key metrics displayed:
- Total Turns: 2,847 (+12.5% vs last period)
- Total Cost: $87.42 (+8.3% vs last period)
- Total Tokens: 15.7M
- Sessions: 143

### Models Page

Detailed model analytics showing:
- Token usage by model (horizontal bar chart)
- Cost distribution (pie chart)
- Comprehensive table with all models, providers, usage stats

### Codebases Page

Project-level tracking:
- Cost and token breakdown by codebase
- Visual cards for each project with metadata
- Last activity timestamps

## Performance

- **Initial Load**: < 2s
- **Chart Render**: < 200ms
- **Data Updates**: Instant with TanStack Query caching
- **Bundle Size**: Lazy-loaded chart components

## Browser Support

- Chrome/Edge 90+
- Firefox 90+
- Safari 15+
- Mobile Safari iOS 15+

## Contributing

This package is part of the `oh-pi` monorepo. See the root `CONTRIBUTING.md` for guidelines.

## License

MIT © Ifiok Jr.
