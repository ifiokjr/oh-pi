---
default: minor
---

### `@ifi/oh-pi-skills` — Initial release

10 skill packs across three categories.

**Tool skills** (zero-dependency Node.js scripts):

- `context7` — Query latest library documentation via the Context7 API
- `web-search` — DuckDuckGo search (free, no API key required)
- `web-fetch` — Extract webpage content as clean plain text

**UI design system skills** (CSS tokens + component specs):

- `liquid-glass` — Apple WWDC 2025 translucent glass style with `--lg-` CSS custom properties
- `glassmorphism` — Frosted glass blur and transparency with `--glass-` tokens
- `claymorphism` — Soft 3D clay-like surfaces with `--clay-` tokens
- `neubrutalism` — Bold borders, offset shadows, high contrast with `--nb-` tokens

**Workflow skills** (strategy guides):

- `quick-setup` — Detect project type and generate `.pi/` configuration
- `debug-helper` — Error analysis, log interpretation, and profiling
- `git-workflow` — Branching, commits, PRs, and conflict resolution

Each skill directory contains a `SKILL.md` manifest and supporting files. Install via
`pi install npm:@ifi/oh-pi-skills`.
