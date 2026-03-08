# Module Dependency Graph & Single Responsibility Analysis

> Generated: 2026-02-16 | Updated after refactoring
> Based on commit 46c1d85 (refactor: single responsibility refactoring)

---

## 1. Full ASCII Module Dependency Graph

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                      oh-pi Full Module Dependency Graph                      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ┌─────────────────── src/ layer (TUI Configuration Tool) ──────────────┐   ║
║  │                                                                       │   ║
║  │              ┌──────────────┐                                         │   ║
║  │              │ src/index.ts │ ◄── Main entry (96 lines)               │   ║
║  │              └──────┬───────┘                                         │   ║
║  │                     │                                                 │   ║
║  │         ┌───────────┼───────────────┐                                 │   ║
║  │         │           │               │                                 │   ║
║  │         ▼           ▼               ▼                                 │   ║
║  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐                        │   ║
║  │  │ i18n.ts  │ │ types.ts │ │ utils/detect.ts│                        │   ║
║  │  │  (61 ln) │ │  (69 ln) │ │    (112 ln)    │                        │   ║
║  │  └────┬─────┘ └──────────┘ └────────────────┘                        │   ║
║  │       │                                                               │   ║
║  │       ▼                                                               │   ║
║  │  ┌────────────┐  ┌──────────────┐                                    │   ║
║  │  │ locales.ts │  │ registry.ts  │                                    │   ║
║  │  │  (420 ln)  │  │   (77 ln)    │                                    │   ║
║  │  └────────────┘  └──────┬───────┘                                    │   ║
║  │                         │ (imported by tui/*.ts + writers.ts)          │   ║
║  │                         ▼                                             │   ║
║  │            ┌────────────────┐     ┌──────────────────┐               │   ║
║  │            │utils/install.ts│────▶│ utils/resources.ts│              │   ║
║  │            │    (98 ln)     │     │     (19 ln)       │              │   ║
║  │            └───────┬────────┘     └──────────────────┘               │   ║
║  │                    │                                                  │   ║
║  │                    ▼                                                  │   ║
║  │            ┌────────────────┐                                        │   ║
║  │            │utils/writers.ts│ ◄── 8 independent writer functions     │   ║
║  │            │    (152 ln)    │                                        │   ║
║  │            └────────────────┘                                        │   ║
║  │                                                                       │   ║
║  │  ※ src/index.ts also imports 9 tui/* modules (omitted from graph)    │   ║
║  │    welcome, mode-select, provider-setup, preset-select,               │   ║
║  │    theme-select, keybinding-select, extension-select,                 │   ║
║  │    agents-select, confirm-apply                                       │   ║
║  │                                                                       │   ║
║  └───────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║                          ║ No direct imports ║                                ║
║                          ║ Bridged via pi     ║                               ║
║                          ║ Extension API      ║                               ║
║                          ▼                    ▼                               ║
║                                                                              ║
║  ┌──────────── ant-colony/ layer (Multi-Agent Swarm System) ────────────┐   ║
║  │                                                                       │   ║
║  │              ┌───────────────────┐                                    │   ║
║  │              │ ant-colony/       │ ◄── Extension entry (600 ln)       │   ║
║  │              │   index.ts        │                                    │   ║
║  │              └───────┬───────────┘                                    │   ║
║  │                      │                                                │   ║
║  │          ┌───────────┼────────────┬──────────┐                        │   ║
║  │          │           │            │          │                        │   ║
║  │          ▼           ▼            ▼          ▼                        │   ║
║  │   ┌───────────┐ ┌─────────┐ ┌──────────┐ ┌───────┐                  │   ║
║  │   │ queen.ts  │ │ nest.ts │ │ types.ts │ │ ui.ts │                  │   ║
║  │   │  (640 ln) │ │(298 ln) │ │ (144 ln) │ │(46 ln)│                  │   ║
║  │   └─────┬─────┘ └─────────┘ └──────────┘ └───────┘                  │   ║
║  │         │                         ▲                                   │   ║
║  │         │ imports                 │ (depended on by all modules)       │   ║
║  │    ┌────┼────┬────────┐           │                                   │   ║
║  │    │    │    │        │           │                                   │   ║
║  │    ▼    ▼    ▼        ▼           │                                   │   ║
║  │ ┌──────────┐┌──────────┐┌─────────────────┐                          │   ║
║  │ │spawner.ts││  deps.ts ││ concurrency.ts  │                          │   ║
║  │ │ (309 ln) ││  (94 ln) ││    (120 ln)     │                          │   ║
║  │ └────┬─────┘└──────────┘└─────────────────┘                          │   ║
║  │      │                                                                │   ║
║  │  ┌───┴────────┐                                                      │   ║
║  │  │             │                                                      │   ║
║  │  ▼             ▼                                                      │   ║
║  │ ┌───────────┐ ┌──────────┐                                           │   ║
║  │ │prompts.ts │ │parser.ts │                                           │   ║
║  │ │  (98 ln)  │ │  (72 ln) │                                           │   ║
║  │ └───────────┘ └──────────┘                                           │   ║
║  │                                                                       │   ║
║  └───────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Detailed Dependency Edge List

```
src/index.ts
  ├──▶ src/i18n.ts              (selectLanguage, getLocale, t)
  ├──▶ src/types.ts             (type OhPConfig)
  ├──▶ src/utils/detect.ts      (detectEnv, type EnvInfo)
  └──▶ src/tui/*.ts × 9        (welcome, mode-select, provider-setup, ...)

src/i18n.ts
  ├──▶ src/types.ts             (type Locale)
  └──▶ src/locales.ts           (messages)

src/registry.ts
  └──▶ src/types.ts             (type ModelCapabilities)

src/tui/provider-setup.ts
  ├──▶ src/types.ts             (type ProviderConfig, type DiscoveredModel)
  └──▶ src/registry.ts          (PROVIDERS)

src/tui/extension-select.ts
  └──▶ src/registry.ts          (EXTENSIONS)

src/tui/theme-select.ts
  └──▶ src/registry.ts          (THEMES)

src/tui/confirm-apply.ts
  ├──▶ src/types.ts             (type OhPConfig)
  └──▶ src/utils/install.ts     (applyConfig, installPi, backupConfig)

src/utils/install.ts
  └──▶ src/utils/writers.ts     (writeProviderEnv, writeModelConfig, ...)

src/utils/writers.ts
  ├──▶ src/types.ts             (type OhPConfig)
  ├──▶ src/registry.ts          (KEYBINDING_SCHEMES, MODEL_CAPABILITIES, PROVIDERS)
  ├──▶ src/utils/resources.ts   (resources)
  └──▶ src/utils/install.ts     (ensureDir, syncDir)

ant-colony/index.ts
  ├──▶ ant-colony/queen.ts      (runColony, resumeColony, QueenCallbacks)
  ├──▶ ant-colony/nest.ts       (Nest)
  ├──▶ ant-colony/types.ts      (ColonyState, ColonyMetrics, AntStreamEvent)
  └──▶ ant-colony/ui.ts         (formatDuration, formatCost, formatTokens, statusIcon, casteIcon)

ant-colony/queen.ts              ◄── Highest fan-out (5 internal deps)
  ├──▶ ant-colony/types.ts
  ├──▶ ant-colony/nest.ts
  ├──▶ ant-colony/spawner.ts
  ├──▶ ant-colony/concurrency.ts
  └──▶ ant-colony/deps.ts

ant-colony/spawner.ts
  ├──▶ ant-colony/types.ts
  ├──▶ ant-colony/nest.ts
  ├──▶ ant-colony/prompts.ts
  └──▶ ant-colony/parser.ts

ant-colony/parser.ts
  ├──▶ ant-colony/types.ts
  └──▶ ant-colony/spawner.ts    (makePheromoneId)
```

---

## 2. Fan-In/Fan-Out Analysis

| Module | Fan-In | Fan-Out | Lines | Role |
|--------|:------:|:-------:|:-----:|------|
| `ant-colony/types.ts` | **8** | 0 | 144 | Pure leaf, foundational types |
| `src/types.ts` | **5** | 0 | 69 | Pure leaf, interface definitions |
| `src/registry.ts` | **3** | 1 | 77 | Runtime constant registry |
| `ant-colony/nest.ts` | 3 | 1 | 298 | Shared state management |
| `ant-colony/queen.ts` | 1 | **5** | 640 | Highest fan-out, scheduling core |
| `ant-colony/spawner.ts` | 2 | **4** | 309 | Agent lifecycle management |
| `ant-colony/index.ts` | 0 (entry) | 4 | 600 | Extension registration entry |
| `src/index.ts` | 0 (entry) | 3+9 tui | 96 | TUI flow orchestration |

---

## 3. SRP Assessment Per Module

### src/ layer (19 modules, ~1,732 lines)

| Module | Lines | Assessment | Notes |
|--------|:-----:|:----------:|-------|
| `src/index.ts` | 96 | ✅ | Pure orchestration, delegates each step |
| `src/types.ts` | 69 | ✅ | Pure types, zero runtime code |
| `src/registry.ts` | 77 | ✅ | Single responsibility: configurable item registry |
| `src/i18n.ts` | 61 | ✅ | Translation data separated to locales.ts |
| `src/locales.ts` | 420 | ✅ | Pure data, new languages only edit this file |
| `src/utils/detect.ts` | 112 | ✅ | Single responsibility: environment info collection |
| `src/utils/install.ts` | 98 | ✅ | 8-line orchestration after refactor |
| `src/utils/writers.ts` | 152 | ✅ | 8 independent writer functions |
| `src/utils/resources.ts` | 19 | ✅ | Pure function, zero side effects |

### ant-colony/ layer (10 modules, ~2,421 lines)

| Module | Lines | Assessment | Notes |
|--------|:-----:|:----------:|-------|
| `index.ts` | 600 | ⚠️ Minor | Panel building coupled with registration (acceptable for extension entry) |
| `queen.ts` | 640 | ⚠️ Minor | Rate limiting mixed with orchestration (acceptable for Orchestrator pattern) |
| `spawner.ts` | 309 | ✅ | Prompts and parsing extracted out |
| `prompts.ts` | 98 | ✅ | Single responsibility: caste prompt management |
| `parser.ts` | 72 | ✅ | Single responsibility: structured output parsing |
| `ui.ts` | 46 | ✅ | Pure display logic, zero side effects |
| `nest.ts` | 298 | ✅ | All methods around nest state CRUD |
| `concurrency.ts` | 120 | ✅ | Pure functions, zero internal dependencies |
| `deps.ts` | 94 | ✅ | Pure functions, zero internal dependencies |
| `types.ts` | 144 | ✅ | Type aggregation module |

---

## 4. Two-Layer Decoupling Analysis

```
  src/ layer (19 modules, ~1,732 lines)    ant-colony/ layer (10 modules, ~2,421 lines)
  ┌─────────┐                              ┌──────────────┐
  │ TUI      │ ══ Zero imports ═══════════ │ Multi-Agent  │
  │ Config   │                              │ Swarm System │
  └─────────┘                              └──────────────┘
       │                                          │
       │  install.ts copies                       │  pi Extension API
       │  extension files to                      │  (registerTool,
       │  ~/.pi/agent/extensions/                 │   registerCommand,
       │                                          │   sendMessage, ...)
       ▼                                          ▼
  ┌─────────────────────────────────────────────────────┐
  │          @mariozechner/pi-coding-agent               │
  │                (runtime host)                         │
  └─────────────────────────────────────────────────────┘
```

**Key finding**: src/ and ant-colony/ have **zero direct imports** — fully bridged via the pi Extension API. This is excellent architectural decoupling — both layers can evolve independently. The only coupling point is `install.ts` physically copying extension files to the user directory.

---

## 5. Circular Dependency Detection

```
⚠️ Found 1 circular dependency:

  src/utils/install.ts ──▶ src/utils/writers.ts
                     ◀──
  (install.ts exports ensureDir/syncDir; writers.ts imports them)
  (install.ts imports writers.ts's 8 writer functions)

  Severity: 🟢 Low — bidirectional dependency between utility functions
  and their consumer. TypeScript handles this correctly (not a runtime cycle).
  To eliminate: extract ensureDir/syncDir to src/utils/fs-helpers.ts.

All other modules have no circular dependencies.
```
