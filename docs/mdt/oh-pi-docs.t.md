<!-- {@ohPiCoreAgentPathsOverview} -->

`@ifi/oh-pi-core` exposes a small set of path helpers for packages that need to resolve the pi agent directory, extension config locations, and shared workspace-scoped storage paths without hardcoding `~/.pi/agent` throughout the codebase.

Use these helpers when a package needs to:

- honor `PI_CODING_AGENT_DIR`
- expand `~` consistently across platforms
- mirror a workspace path into shared storage
- compute stable extension config file locations

<!-- {/ohPiCoreAgentPathsOverview} -->

<!-- {@ohPiCoreExpandHomeDirDocs} -->

Expand a leading `~` in a path using the configured home directory override when present.

This helper leaves non-home-relative paths unchanged so callers can safely normalize optional user input before resolving it further.

<!-- {/ohPiCoreExpandHomeDirDocs} -->

<!-- {@ohPiCoreResolvePiAgentDirDocs} -->

Resolve the effective pi agent directory.

The resolver prefers `PI_CODING_AGENT_DIR` when it is set, expands `~` consistently, and otherwise falls back to the standard `~/.pi/agent` location.

<!-- {/ohPiCoreResolvePiAgentDirDocs} -->

<!-- {@ohPiCoreGetExtensionConfigPathDocs} -->

Build the config file path for a named extension under the resolved pi agent directory.

Use this helper instead of manually concatenating `extensions/<name>/config.json` so every package shares the same config-root resolution behavior.

<!-- {/ohPiCoreGetExtensionConfigPathDocs} -->

<!-- {@ohPiCoreGetMirroredWorkspacePathSegmentsDocs} -->

Convert a workspace path into stable mirrored path segments for shared storage.

The first segment encodes the filesystem root and the remaining segments mirror the resolved workspace path, which keeps shared state unique across repositories and drives.

<!-- {/ohPiCoreGetMirroredWorkspacePathSegmentsDocs} -->

<!-- {@ohPiCoreGetSharedStoragePathDocs} -->

Build a shared storage path inside the pi agent directory for a workspace-scoped namespace.

This helper combines the resolved pi agent directory, a package namespace, the mirrored workspace segments, and any additional relative path segments into one canonical storage location.

<!-- {/ohPiCoreGetSharedStoragePathDocs} -->

<!-- {@sharedQnaPiTuiLoaderOverview} -->

`@ifi/pi-shared-qna` centralizes `@mariozechner/pi-tui` loading so first-party packages reuse one fallback strategy instead of embedding Bun-global lookup logic in multiple runtime modules.

The shared loader tries the normal package resolution path first, then falls back to Bun global install locations when a project is running outside a conventional dependency layout.

<!-- {/sharedQnaPiTuiLoaderOverview} -->

<!-- {@sharedQnaGetPiTuiFallbackPathsDocs} -->

Return the ordered list of Bun global fallback paths to try for `@mariozechner/pi-tui`.

The list prefers an explicit `BUN_INSTALL` root when provided and always includes the default `~/.bun/install/global/node_modules/@mariozechner/pi-tui` fallback without duplicates.

<!-- {/sharedQnaGetPiTuiFallbackPathsDocs} -->

<!-- {@sharedQnaRequirePiTuiModuleDocs} -->

Load `@mariozechner/pi-tui` with a shared fallback strategy.

The loader first tries the normal package import path, then walks the Bun-global fallback list, and finally throws a helpful error that names every checked location when none of them resolve.

<!-- {/sharedQnaRequirePiTuiModuleDocs} -->

<!-- {@piSpecSubcommandsDocs} -->

Canonical `/spec` subcommands exposed by the extension. Keep README command lists and exported type metadata in sync with this source of truth: `status`, `help`, `init`, `constitution`, `specify`, `clarify`, `checklist`, `plan`, `tasks`, `analyze`, `implement`, `list`, and `next`.

<!-- {/piSpecSubcommandsDocs} -->

<!-- {@piSpecWorkflowStepsDocs} -->

Workflow steps that hand work back into pi for feature execution. These ordered steps are `constitution`, `specify`, `clarify`, `checklist`, `plan`, `tasks`, `analyze`, and `implement`. Keep contributor-facing docs aligned with the same sequence.

<!-- {/piSpecWorkflowStepsDocs} -->

<!-- {@subagentsProjectAgentStorageOverview} -->

Subagents stores project-scope agents and chains in shared pi storage by default under a workspace-mirrored path, so repositories stay clean while still supporting parent-workspace lookup for nested projects. Legacy repo-local `.pi/agents/` storage remains available as an explicit project-mode override.

<!-- {/subagentsProjectAgentStorageOverview} -->

<!-- {@subagentsResolveProjectAgentStorageOptionsDocs} -->

Resolve the effective project-agent storage mode and shared root. Explicit options take precedence, then environment variables, then extension config, and shared storage is the default when no override is provided.

<!-- {/subagentsResolveProjectAgentStorageOptionsDocs} -->

<!-- {@subagentsGetSharedProjectAgentsDirDocs} -->

Build the shared directory for project-scope agent and chain definitions. The path combines the shared root, a mirrored workspace path, and the trailing `agents/` directory so different projects stay isolated from one another.

<!-- {/subagentsGetSharedProjectAgentsDirDocs} -->

<!-- {@subagentsMigrateLegacyProjectAgentsDocs} -->

Best-effort migration for legacy repo-local project agents. When shared mode is active, discovered `.pi/agents/` directories are copied into shared storage and the empty legacy `.pi/` directory is removed when possible.

<!-- {/subagentsMigrateLegacyProjectAgentsDocs} -->

<!-- {@subagentsFindNearestProjectAgentsDirDocs} -->

Find the highest-priority project agents directory for the current workspace. The resolver walks up parent workspaces, migrates legacy storage when needed, and preserves the same nearest-parent lookup semantics in both shared and project storage modes.

<!-- {/subagentsFindNearestProjectAgentsDirDocs} -->

<!-- {@extensionsWatchdogConfigOverview} -->

The watchdog extension reads optional runtime protection settings from a JSON config file in the pi agent directory. That config controls whether sampling is enabled, how frequently samples run, and which CPU, memory, and event-loop thresholds trigger alerts or safe-mode escalation.

<!-- {/extensionsWatchdogConfigOverview} -->

<!-- {@extensionsWatchdogConfigPathDocs} -->

Path to the optional watchdog JSON config file under the pi agent directory. This is the default location used for watchdog sampling, threshold overrides, and enable/disable settings.

<!-- {/extensionsWatchdogConfigPathDocs} -->

<!-- {@extensionsLoadWatchdogConfigDocs} -->

Load watchdog config from disk and return a safe object. Missing files, invalid JSON, or malformed values all fall back to an empty config so runtime monitoring can continue safely.

<!-- {/extensionsLoadWatchdogConfigDocs} -->

<!-- {@extensionsResolveWatchdogThresholdsDocs} -->

Resolve the effective watchdog thresholds by merging optional config overrides onto the built-in default thresholds.

<!-- {/extensionsResolveWatchdogThresholdsDocs} -->

<!-- {@extensionsResolveWatchdogSampleIntervalMsDocs} -->

Resolve the watchdog sampling interval in milliseconds, clamping configured values into the supported range and falling back to the default interval when no valid override is provided.

<!-- {/extensionsResolveWatchdogSampleIntervalMsDocs} -->

<!-- {@extensionsSchedulerOverview} -->

The scheduler extension adds recurring checks, one-time reminders, and the LLM-callable `schedule_prompt` tool so pi can schedule future follow-ups like PR, CI, build, or deployment checks. Tasks run only while pi is active and idle, and scheduler state is persisted in shared pi storage using a workspace-mirrored path.

<!-- {/extensionsSchedulerOverview} -->

<!-- {@repoMdtUsageRuleDocs} -->

Use MDT through `pnpm mdt ...`, not a globally installed `mdt` binary. This keeps documentation reuse commands pinned to the repo's declared `@ifi/mdt` version and makes local runs, CI, and agent instructions consistent.

<!-- {/repoMdtUsageRuleDocs} -->

<!-- {@repoMdtCommandsDocs} -->

```bash
pnpm mdt list
pnpm mdt update
pnpm mdt check
```

Convenience wrappers remain available too:

```bash
pnpm docs:list
pnpm docs:update
pnpm docs:check
```

<!-- {/repoMdtCommandsDocs} -->

<!-- {@repoMdtCiDocs} -->

CI runs `pnpm mdt check` so provider and consumer blocks stay in sync with the repo-pinned MDT version.

<!-- {/repoMdtCiDocs} -->

<!-- {@extensionsUsageTrackerOverview} -->

The usage-tracker extension is a CodexBar-inspired provider quota and cost monitor for pi. It shows provider-level rate limits for Anthropic, OpenAI, and Google using pi-managed auth, while also tracking per-model token usage and session costs locally.

<!-- {/extensionsUsageTrackerOverview} -->

<!-- {@extensionsUsageTrackerPersistenceDocs} -->

Usage-tracker persists rolling 30-day cost history and the last known provider rate-limit snapshot under the pi agent directory. That lets the widget and dashboard survive restarts and keep showing recent subscription windows when a live provider probe is temporarily rate-limited or unavailable.

<!-- {/extensionsUsageTrackerPersistenceDocs} -->

<!-- {@extensionsUsageTrackerCommandsDocs} -->

Key usage-tracker surfaces:

- widget above the editor for at-a-glance quotas and session totals
- `/usage` for the full dashboard overlay
- `Ctrl+Shift+U` as a shortcut for the same overlay
- `/usage-toggle` to show or hide the widget
- `/usage-refresh` to force fresh provider probes
- `usage_report` so the agent can answer quota and spend questions directly

<!-- {/extensionsUsageTrackerCommandsDocs} -->

<!-- {@extensionsSchedulerOwnershipDocs} -->

The scheduler distinguishes between instance-scoped tasks and workspace-scoped tasks. Instance scope is the default for `/loop`, `/remind`, and `schedule_prompt`, which means tasks stay owned by one pi instance and other instances restore them for review instead of auto-running them. Workspace scope is an explicit opt-in for shared CI/build/deploy monitors that should survive instance changes in the same repository.

<!-- {/extensionsSchedulerOwnershipDocs} -->

<!-- {@extensionsWatchdogAlertBehaviorDocs} -->

The watchdog samples CPU, memory, and event-loop lag on an interval, records recent samples and alerts, and can escalate into safe mode automatically when repeated alerts indicate sustained UI churn or lag. Toast notifications are intentionally capped per session; ongoing watchdog state is kept visible in the status bar and the `/watchdog` overlay instead of repeatedly spamming the terminal.

<!-- {/extensionsWatchdogAlertBehaviorDocs} -->

<!-- {@repoStartHerePathDocs} -->

Use this reading path depending on what you are trying to do:

- **I just want to use oh-pi** → start in the root `README.md`, then jump into `docs/feature-catalog.md` for package-by-package detail
- **I want to try the latest local changes** → run `pnpm install`, `pnpm pi:local`, restart `pi`, then exercise the feature in a real session
- **I want to contribute** → read `CONTRIBUTING.md`, then the package README for the area you are changing
- **I want to understand ownership** → use `docs/feature-catalog.md` to see which package owns which runtime feature, content pack, or library surface

<!-- {/repoStartHerePathDocs} -->

<!-- {@repoArchitectureAtAGlanceDocs} -->

```text
oh-pi repo
├── installer
│   └── @ifi/oh-pi
├── default runtime packages
│   ├── extensions
│   ├── background-tasks
│   ├── diagnostics
│   ├── subagents
│   ├── plan
│   ├── spec
│   └── web-remote
├── content packs
│   ├── themes
│   ├── prompts
│   ├── skills
│   └── agents
├── opt-in extras
│   ├── adaptive-routing
│   ├── provider-catalog
│   ├── provider-cursor
│   ├── provider-ollama
│   ├── analytics-extension
│   ├── pi-remote-tailscale
│   ├── pi-bash-live-view
│   └── pi-pretty
└── contributor libraries
    ├── core
    ├── cli
    ├── shared-qna
    ├── web-client
    ├── web-server
    ├── analytics-db
    ├── analytics-dashboard
    └── docs
```

<!-- {/repoArchitectureAtAGlanceDocs} -->

<!-- {@repoDefaultInstallerPackagesDocs} -->

Default runtime/content packages installed by `npx @ifi/oh-pi`:

- `@ifi/oh-pi-extensions`
- `@ifi/pi-background-tasks`
- `@ifi/pi-diagnostics`
- `@ifi/pi-extension-subagents`
- `@ifi/pi-plan`
- `@ifi/pi-spec`
- `@ifi/pi-web-remote`
- `@ifi/oh-pi-themes`
- `@ifi/oh-pi-prompts`
- `@ifi/oh-pi-skills`

<!-- {/repoDefaultInstallerPackagesDocs} -->

<!-- {@repoExperimentalPackagesDocs} -->

Opt-in packages that stay separate from the default installer bundle:

- `@ifi/pi-extension-adaptive-routing`
- `@ifi/pi-provider-catalog`
- `@ifi/pi-provider-cursor`
- `@ifi/pi-provider-ollama`
- `@ifi/pi-analytics-extension`
- `@ifi/pi-remote-tailscale`
- `@ifi/pi-bash-live-view`
- `@ifi/pi-pretty`

<!-- {/repoExperimentalPackagesDocs} -->

<!-- {@repoContributorCompiledPackagesDocs} -->

Most runtime packages in this repo ship raw TypeScript and can be loaded directly by pi. A smaller set of contributor-facing packages (`core`, `cli`, `web-client`, `web-server`) emit `dist/` output, so build those when you are working on them directly.

<!-- {/repoContributorCompiledPackagesDocs} -->

<!-- {@repoPiLocalSwitcherOverviewDocs} -->

The `pnpm pi:local` workflow points a real pi install at this checkout instead of the published npm packages. It is the normal local development loop for testing unpublished oh-pi changes in a real interactive pi session.

<!-- {/repoPiLocalSwitcherOverviewDocs} -->

<!-- {@repoPiLocalQuickstartDocs} -->

```bash
pnpm install
pnpm pi:local
pi
```

<!-- {/repoPiLocalQuickstartDocs} -->

<!-- {@repoPiLocalWhatItDoesDocs} -->

`pnpm pi:local` runs the repo-local source switcher in `local` mode. It:

- rewrites only the managed oh-pi package sources in your pi settings
- points those package sources at the workspace packages in this checkout
- preserves package-specific config objects already present in `settings.json`
- refreshes package manifest paths so newly added extensions/prompts/skills/themes are picked up
- runs `pi install` for newly added managed packages and `pi update` for packages you already had configured
- manages the default installer set and the opt-in experimental packages used for local feature development
- lets you validate unpublished changes from a branch, worktree, or detached checkout before release

<!-- {/repoPiLocalWhatItDoesDocs} -->

<!-- {@repoPiLocalManagedPackagesDocs} -->

Managed local switching covers these packages:

- `@ifi/oh-pi-extensions`
- `@ifi/pi-background-tasks`
- `@ifi/pi-diagnostics`
- `@ifi/pi-extension-subagents`
- `@ifi/pi-plan`
- `@ifi/pi-spec`
- `@ifi/pi-web-remote`
- `@ifi/oh-pi-themes`
- `@ifi/oh-pi-prompts`
- `@ifi/oh-pi-skills`
- `@ifi/pi-extension-adaptive-routing`
- `@ifi/pi-provider-catalog`
- `@ifi/pi-provider-cursor`
- `@ifi/pi-provider-ollama`
- `@ifi/pi-analytics-extension`

<!-- {/repoPiLocalManagedPackagesDocs} -->

<!-- {@repoPiSourceSwitchRestartDocs} -->

After switching package sources, fully restart `pi`. Do not rely on `/reload` for source switches, because it can keep previously loaded package modules alive.

<!-- {/repoPiSourceSwitchRestartDocs} -->

<!-- {@repoPiLocalInstallFreshnessDocs} -->

If you recently pulled, rebased, or switched branches in the checkout you pointed `pi` at, run `pnpm install --frozen-lockfile` there before restarting `pi`. Local source mode loads workspace files directly, so stale `node_modules` can surface missing internal `@ifi/*` package errors.

<!-- {/repoPiLocalInstallFreshnessDocs} -->

<!-- {@repoContributorReadingPathDocs} -->

Suggested path for a new contributor:

1. skim the root `README.md` for the package map and the local dev loop
2. read `docs/feature-catalog.md` to understand which package owns which feature
3. run `pnpm install` and `pnpm pi:local`
4. restart `pi` and exercise the feature in a real session
5. open the package README for the area you are changing, then run the relevant build/test commands

<!-- {/repoContributorReadingPathDocs} -->
