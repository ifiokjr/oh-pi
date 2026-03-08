# Refactor Plan: Monorepo Multi-Package Split

> Split oh-pi into individually consumable pi packages under `@ifi/*`, with a meta-package that bundles everything.

## 1. Guiding Principles

### From the pi package system

Pi packages are npm/git bundles discovered by a `"pi"` key in `package.json` (or conventional directory layout: `extensions/`, `skills/`, `prompts/`, `themes/`). Each package can be installed independently via `pi install npm:@ifi/oh-pi-extensions` and the resources are auto-loaded.

Key constraints from the pi package spec:

- **Extensions are loaded via jiti** — raw `.ts` files, no compilation needed by consumers
- **Pi core packages must be `peerDependencies` with `"*"` range**: `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox`
- **Each package needs a `"pi"` manifest** in `package.json` or conventional dirs
- **The `"pi-package"` keyword** makes it discoverable on the pi package gallery
- **Resources are path-based** — `"extensions": ["./extensions"]` points to dirs of `.ts` files

### Design goals

1. **Individual consumption**: `pi install npm:@ifi/oh-pi-ant-colony` installs just the colony extension
2. **Combination consumption**: `pi install npm:@ifi/oh-pi` installs everything
3. **The CLI remains a standalone `npx` tool**: `npx @ifi/oh-pi` runs the TUI configurator
4. **Shared types live in a core package** imported by extensions at dev time (but pi provides the runtime)
5. **pnpm workspace** for local development, independent publishing

---

## 2. Package Map

### 2.1 Package Overview

```
@ifi/oh-pi-core          Shared types, registries, i18n — foundation for CLI and extensions
@ifi/oh-pi-extensions    All non-colony extensions (safe-guard, git-guard, etc.) as a pi package
@ifi/oh-pi-ant-colony    The ant colony multi-agent extension as a standalone pi package
@ifi/oh-pi-themes        All themes as a standalone pi package
@ifi/oh-pi-prompts       All prompt templates as a standalone pi package
@ifi/oh-pi-skills        All skills as a standalone pi package
@ifi/oh-pi-agents        All AGENTS.md templates as a standalone pi package
@ifi/oh-pi-cli           The TUI configurator binary (npx @ifi/oh-pi-cli)
@ifi/oh-pi               Meta-package: re-exports everything, single install for all resources
```

### 2.2 Dependency Graph

```
                         @ifi/oh-pi (meta)
                             │
         ┌───────────┬───────┼────────┬──────────┬──────────┐
         │           │       │        │          │          │
         ▼           ▼       ▼        ▼          ▼          ▼
   @ifi/oh-pi-  @ifi/oh-pi- @ifi/oh-pi- @ifi/oh-pi- @ifi/oh-pi- @ifi/oh-pi-
   extensions   ant-colony  themes    prompts    skills    agents
         │           │
         │           │ (devDependency for types only)
         ▼           ▼
      @ifi/oh-pi-core
         │
         │ (peerDependency "*")
         ▼
  @mariozechner/pi-coding-agent  (runtime host)

  @ifi/oh-pi-cli ──▶ @ifi/oh-pi-core (dependency)
       │
       │  (publishes to npm with bin: { "oh-pi": ... })
       ▼
  npx @ifi/oh-pi-cli
```

### 2.3 What Each Package Contains

#### `@ifi/oh-pi-core` (foundation library)
```
packages/core/
├── package.json            # name: @ifi/oh-pi-core
├── tsconfig.json
└── src/
    ├── index.ts            # Re-exports everything
    ├── types.ts            # Locale, ProviderConfig, OhPConfig, ModelCapabilities
    ├── registry.ts         # MODEL_CAPABILITIES, PROVIDERS, THEMES, EXTENSIONS, KEYBINDING_SCHEMES
    ├── i18n.ts             # t(), setLocale(), detectLocale(), selectLanguage()
    └── locales.ts          # Translation dictionaries (en/zh/fr)
```

- **Published as**: compiled ESM (`dist/`) + TypeScript declarations
- **Used by**: `@ifi/oh-pi-cli` (direct dependency), extensions (devDependency for type imports only — at runtime pi provides the host)
- **Not a pi package** — this is a pure library, no `"pi"` manifest

#### `@ifi/oh-pi-extensions` (pi package)
```
packages/extensions/
├── package.json            # name: @ifi/oh-pi-extensions, keyword: pi-package
├── extensions/
│   ├── auto-session-name.ts
│   ├── auto-update.ts
│   ├── auto-update.test.ts
│   ├── bg-process.ts
│   ├── compact-header.ts
│   ├── custom-footer.ts
│   ├── git-guard.ts
│   ├── safe-guard.ts
│   └── safe-guard.test.ts
└── README.md
```

- **Installed via**: `pi install npm:@ifi/oh-pi-extensions`
- **No compilation** — pi loads `.ts` files directly via jiti
- **Tests live alongside source** — vitest runs from workspace root

#### `@ifi/oh-pi-ant-colony` (pi package)
```
packages/ant-colony/
├── package.json            # name: @ifi/oh-pi-ant-colony, keyword: pi-package
├── extensions/
│   └── ant-colony/
│       ├── index.ts        # Extension entry point
│       ├── queen.ts
│       ├── nest.ts
│       ├── spawner.ts
│       ├── concurrency.ts
│       ├── deps.ts
│       ├── parser.ts
│       ├── prompts.ts
│       ├── types.ts
│       └── ui.ts
├── tests/                  # Tests in separate dir (not shipped)
│   ├── concurrency.test.ts
│   ├── deps.test.ts
│   ├── nest.test.ts
│   ├── parser.test.ts
│   ├── prompts.test.ts
│   ├── queen.test.ts
│   ├── spawner.test.ts
│   ├── types.test.ts
│   └── ui.test.ts
└── README.md
```

- **Installed via**: `pi install npm:@ifi/oh-pi-ant-colony`
- **Standalone** — works without any other oh-pi packages
- **Tests separated** — not in `extensions/` so they don't get installed by pi

#### `@ifi/oh-pi-themes` (pi package)
```
packages/themes/
├── package.json            # name: @ifi/oh-pi-themes, keyword: pi-package
└── themes/
    ├── catppuccin-mocha.json
    ├── cyberpunk.json
    ├── gruvbox-dark.json
    ├── nord.json
    ├── oh-p-dark.json
    └── tokyo-night.json
```

- **Installed via**: `pi install npm:@ifi/oh-pi-themes`
- **Pure JSON** — no code, no compilation

#### `@ifi/oh-pi-prompts` (pi package)
```
packages/prompts/
├── package.json            # name: @ifi/oh-pi-prompts, keyword: pi-package
└── prompts/
    ├── commit.md
    ├── document.md
    ├── explain.md
    ├── fix.md
    ├── optimize.md
    ├── pr.md
    ├── refactor.md
    ├── review.md
    ├── security.md
    └── test.md
```

#### `@ifi/oh-pi-skills` (pi package)
```
packages/skills/
├── package.json            # name: @ifi/oh-pi-skills, keyword: pi-package
└── skills/
    ├── claymorphism/SKILL.md
    ├── context7/SKILL.md
    ├── debug-helper/SKILL.md
    ├── git-workflow/SKILL.md
    ├── glassmorphism/SKILL.md
    ├── liquid-glass/SKILL.md
    ├── neubrutalism/SKILL.md
    ├── quick-setup/SKILL.md
    ├── web-fetch/SKILL.md
    └── web-search/SKILL.md
```

#### `@ifi/oh-pi-agents` (pi package)
```
packages/agents/
├── package.json            # name: @ifi/oh-pi-agents, keyword: pi-package
└── agents/                 # Pi doesn't auto-discover agents/, use pi manifest
    ├── colony-operator.md
    ├── data-ai-engineer.md
    ├── fullstack-developer.md
    ├── general-developer.md
    └── security-researcher.md
```

> Note: pi doesn't have a conventional `agents/` auto-discovery. The CLI (`@ifi/oh-pi-cli`) copies selected agent templates to `~/.pi/agent/AGENTS.md`. This package is consumed by the CLI, not directly by pi.

#### `@ifi/oh-pi-cli` (CLI binary)
```
packages/cli/
├── package.json            # name: @ifi/oh-pi-cli, bin: { "oh-pi": ... }
├── tsconfig.json
└── src/
    ├── bin/oh-pi.ts        # CLI entry point
    ├── index.ts            # Main TUI flow orchestrator
    └── tui/
        ├── welcome.ts
        ├── mode-select.ts
        ├── provider-setup.ts
        ├── preset-select.ts
        ├── extension-select.ts
        ├── theme-select.ts
        ├── keybinding-select.ts
        ├── agents-select.ts
        ├── config-wizard.ts
        └── confirm-apply.ts
    └── utils/
        ├── detect.ts
        ├── install.ts
        ├── resources.ts
        └── writers.ts
```

- **Published as**: compiled ESM with `bin` entry
- **Dependencies**: `@ifi/oh-pi-core`, `@clack/prompts`, `chalk`
- **Knows about all resource packages** — uses their paths to copy resources during `applyConfig()`

#### `@ifi/oh-pi` (meta-package)
```
packages/oh-pi/
├── package.json
└── README.md
```

`package.json`:
```json
{
  "name": "@ifi/oh-pi",
  "keywords": ["pi-package"],
  "dependencies": {
    "@ifi/oh-pi-extensions": "workspace:*",
    "@ifi/oh-pi-ant-colony": "workspace:*",
    "@ifi/oh-pi-themes": "workspace:*",
    "@ifi/oh-pi-prompts": "workspace:*",
    "@ifi/oh-pi-skills": "workspace:*",
    "@ifi/oh-pi-agents": "workspace:*"
  },
  "bundledDependencies": [
    "@ifi/oh-pi-extensions",
    "@ifi/oh-pi-ant-colony",
    "@ifi/oh-pi-themes",
    "@ifi/oh-pi-prompts",
    "@ifi/oh-pi-skills",
    "@ifi/oh-pi-agents"
  ],
  "pi": {
    "extensions": [
      "node_modules/@ifi/oh-pi-extensions/extensions",
      "node_modules/@ifi/oh-pi-ant-colony/extensions"
    ],
    "themes": ["node_modules/@ifi/oh-pi-themes/themes"],
    "prompts": ["node_modules/@ifi/oh-pi-prompts/prompts"],
    "skills": ["node_modules/@ifi/oh-pi-skills/skills"]
  }
}
```

This follows the pi packages.md pattern for bundling other packages: dependencies + bundledDependencies + `node_modules/` paths in the `pi` manifest.

---

## 3. Workspace Structure

```
oh-pi/                              # Monorepo root
├── pnpm-workspace.yaml
├── package.json                    # Root: scripts, devDependencies (biome, tsgo, vitest)
├── biome.json                      # Shared linter config
├── tsconfig.base.json              # Shared TS config (extended by packages)
├── vitest.config.ts                # Root test config (workspace mode)
├── .github/workflows/ci.yml
├── README.md
├── CONTRIBUTING.md
├── docs/                           # Project-level documentation
│   └── ...
│
├── packages/
│   ├── core/                       # @ifi/oh-pi-core
│   │   ├── package.json
│   │   ├── tsconfig.json           # extends ../../tsconfig.base.json
│   │   └── src/
│   │
│   ├── cli/                        # @ifi/oh-pi-cli
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │
│   ├── extensions/                 # @ifi/oh-pi-extensions
│   │   ├── package.json
│   │   └── extensions/
│   │
│   ├── ant-colony/                 # @ifi/oh-pi-ant-colony
│   │   ├── package.json
│   │   ├── extensions/
│   │   └── tests/
│   │
│   ├── themes/                     # @ifi/oh-pi-themes
│   │   ├── package.json
│   │   └── themes/
│   │
│   ├── prompts/                    # @ifi/oh-pi-prompts
│   │   ├── package.json
│   │   └── prompts/
│   │
│   ├── skills/                     # @ifi/oh-pi-skills
│   │   ├── package.json
│   │   └── skills/
│   │
│   ├── agents/                     # @ifi/oh-pi-agents
│   │   ├── package.json
│   │   └── agents/
│   │
│   └── oh-pi/                      # @ifi/oh-pi (meta-package)
│       ├── package.json
│       └── README.md
```

### `pnpm-workspace.yaml`
```yaml
packages:
  - "packages/*"
```

### Root `package.json` (workspace root)
```json
{
  "private": true,
  "packageManager": "pnpm@10.30.2",
  "scripts": {
    "build": "pnpm -r --filter './packages/core' --filter './packages/cli' run build",
    "build:fast": "pnpm -r --filter './packages/core' --filter './packages/cli' run build:fast",
    "typecheck": "pnpm -r --filter './packages/core' --filter './packages/cli' run typecheck",
    "test": "vitest run",
    "lint": "biome check .",
    "lint:fix": "biome check --fix .",
    "format": "biome format --write .",
    "check": "biome ci ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@typescript/native-preview": "^7.0.0-dev",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

### `tsconfig.base.json` (shared base)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

---

## 4. Package.json Details

### `@ifi/oh-pi-core`
```json
{
  "name": "@ifi/oh-pi-core",
  "version": "0.2.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./types": { "import": "./dist/types.js", "types": "./dist/types.d.ts" },
    "./registry": { "import": "./dist/registry.js", "types": "./dist/registry.d.ts" },
    "./i18n": { "import": "./dist/i18n.js", "types": "./dist/i18n.d.ts" }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -b",
    "build:fast": "tsgo -config tsconfig.json",
    "typecheck": "tsgo -config tsconfig.json"
  },
  "dependencies": {
    "@clack/prompts": "^1.0.1",
    "chalk": "^5.4.0"
  }
}
```

### `@ifi/oh-pi-cli`
```json
{
  "name": "@ifi/oh-pi-cli",
  "version": "0.2.0",
  "type": "module",
  "bin": { "oh-pi": "dist/bin/oh-pi.js" },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -b",
    "build:fast": "tsgo -config tsconfig.json",
    "typecheck": "tsgo -config tsconfig.json"
  },
  "dependencies": {
    "@ifi/oh-pi-core": "workspace:*"
  }
}
```

### `@ifi/oh-pi-extensions`
```json
{
  "name": "@ifi/oh-pi-extensions",
  "version": "0.2.0",
  "keywords": ["pi-package"],
  "pi": { "extensions": ["./extensions"] },
  "files": ["extensions", "README.md"],
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-agent-core": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

### `@ifi/oh-pi-ant-colony`
```json
{
  "name": "@ifi/oh-pi-ant-colony",
  "version": "0.2.0",
  "keywords": ["pi-package"],
  "pi": { "extensions": ["./extensions"] },
  "files": ["extensions", "README.md"],
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-agent-core": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

### `@ifi/oh-pi-themes` / `prompts` / `skills`
```json
{
  "name": "@ifi/oh-pi-themes",
  "version": "0.2.0",
  "keywords": ["pi-package"],
  "pi": { "themes": ["./themes"] },
  "files": ["themes", "README.md"]
}
```

(Prompts and skills follow the same pattern with their respective resource type.)

### `@ifi/oh-pi-agents`
```json
{
  "name": "@ifi/oh-pi-agents",
  "version": "0.2.0",
  "files": ["agents", "README.md"]
}
```

> Note: This is NOT a pi package (no `"pi"` key). Agent templates are consumed only by `@ifi/oh-pi-cli` which copies the selected template to `~/.pi/agent/AGENTS.md`. Pi has no `agents/` auto-discovery.

---

## 5. How Resources.ts Changes

Currently `resources.ts` resolves paths relative to `pi-package/`. In the monorepo, the CLI needs to resolve paths to sibling workspace packages at publish time.

The solution: the CLI's `resources.ts` uses `import.meta.resolve()` or `createRequire` to locate installed package paths:

```typescript
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export function resolvePackagePath(pkg: string, subpath: string): string {
  const pkgJson = require.resolve(`${pkg}/package.json`);
  return path.join(path.dirname(pkgJson), subpath);
}

export const resources = {
  extensions: () => resolvePackagePath("@ifi/oh-pi-extensions", "extensions"),
  antColony: () => resolvePackagePath("@ifi/oh-pi-ant-colony", "extensions/ant-colony"),
  themes: () => resolvePackagePath("@ifi/oh-pi-themes", "themes"),
  prompts: () => resolvePackagePath("@ifi/oh-pi-prompts", "prompts"),
  skills: () => resolvePackagePath("@ifi/oh-pi-skills", "skills"),
  agents: () => resolvePackagePath("@ifi/oh-pi-agents", "agents"),
};
```

The CLI adds all resource packages as dependencies so they're always resolvable.

---

## 6. Consumer Experience

### Install just the colony extension
```bash
pi install npm:@ifi/oh-pi-ant-colony
# → Installs extensions/ant-colony/ with all its .ts files
# → Available immediately, no other oh-pi packages needed
```

### Install just the themes
```bash
pi install npm:@ifi/oh-pi-themes
# → Installs 6 JSON themes
```

### Install everything
```bash
pi install npm:@ifi/oh-pi
# → Bundles all sub-packages via bundledDependencies
# → All extensions, themes, prompts, skills available
```

### Run the configurator
```bash
npx @ifi/oh-pi-cli
# → Interactive TUI, knows about all resource packages
# → Generates ~/.pi/agent/ config
```

### Install everything + configure
```bash
pi install npm:@ifi/oh-pi
npx @ifi/oh-pi-cli
# → Full setup experience
```

---

## 7. CI Pipeline

```yaml
jobs:
  lint:
    # biome ci . from root (covers all packages)

  typecheck:
    # pnpm typecheck (tsgo on core + cli)

  test:
    # vitest run from root (workspace mode finds all test files)
    # Matrix: Node 20, 22

  build:
    # pnpm build (tsc on core + cli)
    needs: [lint, typecheck, test]

  publish:
    # pnpm publish -r --access public (when tagged)
    needs: [build]
    if: startsWith(github.ref, 'refs/tags/')
```

---

## 8. Migration Steps

### Phase 1: Scaffold workspace (no file moves yet)
1. Create `pnpm-workspace.yaml`
2. Create `tsconfig.base.json`
3. Create `packages/` directory structure
4. Create all `package.json` files
5. Verify `pnpm install` resolves the workspace

### Phase 2: Move files
1. Move `src/types.ts`, `src/registry.ts`, `src/i18n.ts`, `src/locales.ts` → `packages/core/src/`
2. Move `src/bin/`, `src/index.ts`, `src/tui/`, `src/utils/` → `packages/cli/src/`
3. Move `pi-package/extensions/ant-colony/` → `packages/ant-colony/extensions/ant-colony/`
4. Move `pi-package/extensions/*.ts` → `packages/extensions/extensions/`
5. Move `pi-package/themes/` → `packages/themes/themes/`
6. Move `pi-package/prompts/` → `packages/prompts/prompts/`
7. Move `pi-package/skills/` → `packages/skills/skills/`
8. Move `pi-package/agents/` → `packages/agents/agents/`
9. Move ant-colony test files → `packages/ant-colony/tests/`

### Phase 3: Fix imports
1. Update `packages/cli/src/` imports from `./types.js` → `@ifi/oh-pi-core`
2. Update `packages/cli/src/utils/resources.ts` to use `createRequire` pattern
3. Update `packages/cli/src/utils/install.ts` to reference new resource paths
4. Add `@ifi/oh-pi-core` dependency to cli's `package.json`
5. Add resource package dependencies to cli's `package.json`

### Phase 4: Fix tests
1. Update `vitest.config.ts` for workspace mode
2. Update test imports for new package paths
3. Ant-colony tests need to import from `../extensions/ant-colony/` (relative within package)
4. Verify all 231 tests pass

### Phase 5: Fix build + CI
1. Update biome.json includes for new paths
2. Update CI workflow for workspace
3. Verify `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`
4. Verify `pnpm build:fast` (tsgo)

### Phase 6: Verify pi consumption
1. Create a test project
2. `pi install ./packages/ant-colony` — verify extension loads
3. `pi install ./packages/extensions` — verify all extensions load
4. `pi install ./packages/oh-pi` — verify meta-package works
5. `npx ./packages/cli` — verify CLI runs

---

## 9. Version Strategy

- All packages start at `0.2.0` (current is `0.1.85`)
- Use [changesets](https://github.com/changesets/changesets) for independent versioning
- Resource-only packages (themes, prompts, skills) version independently
- `@ifi/oh-pi-core` and `@ifi/oh-pi-cli` version together (shared types)
- `@ifi/oh-pi` meta-package version bumps when any dependency bumps

---

## 10. What Stays at Root

These files stay at the monorepo root (not in any package):

```
README.md                  # Monorepo overview + links to packages
CONTRIBUTING.md            # Contribution guide
ROADMAP.md                 # Project roadmap
PLAN.md                    # Architecture plan
COLONY-ANALYSIS.md         # Colony deep analysis
REFACTOR-PLAN.md           # This document
docs/                      # Internal documentation (not published)
benchmarks/                # Benchmark templates (not published)
.github/                   # CI configuration
biome.json                 # Shared linter config
tsconfig.base.json         # Shared TypeScript config
vitest.config.ts           # Root test orchestration
pnpm-workspace.yaml        # Workspace definition
```
