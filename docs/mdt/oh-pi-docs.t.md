<!-- {@ohPiCoreAgentPathsOverview} -->

`@ifi/oh-pi-core` exposes a small set of path helpers for packages that need to resolve the pi
agent directory, extension config locations, and shared workspace-scoped storage paths without
hardcoding `~/.pi/agent` throughout the codebase.

Use these helpers when a package needs to:

- honor `PI_CODING_AGENT_DIR`
- expand `~` consistently across platforms
- mirror a workspace path into shared storage
- compute stable extension config file locations

<!-- {/ohPiCoreAgentPathsOverview} -->

<!-- {@ohPiCoreExpandHomeDirDocs} -->

Expand a leading `~` in a path using the configured home directory override when present.

This helper leaves non-home-relative paths unchanged so callers can safely normalize optional user
input before resolving it further.

<!-- {/ohPiCoreExpandHomeDirDocs} -->

<!-- {@ohPiCoreResolvePiAgentDirDocs} -->

Resolve the effective pi agent directory.

The resolver prefers `PI_CODING_AGENT_DIR` when it is set, expands `~` consistently, and otherwise
falls back to the standard `~/.pi/agent` location.

<!-- {/ohPiCoreResolvePiAgentDirDocs} -->

<!-- {@ohPiCoreGetExtensionConfigPathDocs} -->

Build the config file path for a named extension under the resolved pi agent directory.

Use this helper instead of manually concatenating `extensions/<name>/config.json` so every package
shares the same config-root resolution behavior.

<!-- {/ohPiCoreGetExtensionConfigPathDocs} -->

<!-- {@ohPiCoreGetMirroredWorkspacePathSegmentsDocs} -->

Convert a workspace path into stable mirrored path segments for shared storage.

The first segment encodes the filesystem root and the remaining segments mirror the resolved
workspace path, which keeps shared state unique across repositories and drives.

<!-- {/ohPiCoreGetMirroredWorkspacePathSegmentsDocs} -->

<!-- {@ohPiCoreGetSharedStoragePathDocs} -->

Build a shared storage path inside the pi agent directory for a workspace-scoped namespace.

This helper combines the resolved pi agent directory, a package namespace, the mirrored workspace
segments, and any additional relative path segments into one canonical storage location.

<!-- {/ohPiCoreGetSharedStoragePathDocs} -->

<!-- {@sharedQnaPiTuiLoaderOverview} -->

`@ifi/pi-shared-qna` centralizes `@mariozechner/pi-tui` loading so first-party packages reuse one
fallback strategy instead of embedding Bun-global lookup logic in multiple runtime modules.

The shared loader tries the normal package resolution path first, then falls back to Bun global
install locations when a project is running outside a conventional dependency layout.

<!-- {/sharedQnaPiTuiLoaderOverview} -->

<!-- {@sharedQnaGetPiTuiFallbackPathsDocs} -->

Return the ordered list of Bun global fallback paths to try for `@mariozechner/pi-tui`.

The list prefers an explicit `BUN_INSTALL` root when provided and always includes the default
`~/.bun/install/global/node_modules/@mariozechner/pi-tui` fallback without duplicates.

<!-- {/sharedQnaGetPiTuiFallbackPathsDocs} -->

<!-- {@sharedQnaRequirePiTuiModuleDocs} -->

Load `@mariozechner/pi-tui` with a shared fallback strategy.

The loader first tries the normal package import path, then walks the Bun-global fallback list, and
finally throws a helpful error that names every checked location when none of them resolve.

<!-- {/sharedQnaRequirePiTuiModuleDocs} -->

<!-- {@piSpecSubcommandsDocs} -->

Canonical `/spec` subcommands exposed by the extension. Keep README command lists and exported type
metadata in sync with this source of truth: `status`, `help`, `init`, `constitution`, `specify`,
`clarify`, `checklist`, `plan`, `tasks`, `analyze`, `implement`, `list`, and `next`.

<!-- {/piSpecSubcommandsDocs} -->

<!-- {@piSpecWorkflowStepsDocs} -->

Workflow steps that hand work back into pi for feature execution. These ordered steps are
`constitution`, `specify`, `clarify`, `checklist`, `plan`, `tasks`, `analyze`, and `implement`.
Keep contributor-facing docs aligned with the same sequence.

<!-- {/piSpecWorkflowStepsDocs} -->

<!-- {@antColonySharedStorageOverview} -->

Ant-colony stores runtime state outside the repository by default under the shared pi agent
directory, mirroring the workspace path so each repo gets its own isolated storage root.
Project-local `.ant-colony/` storage remains available as an explicit opt-in for legacy workflows.

<!-- {/antColonySharedStorageOverview} -->

<!-- {@antColonyResolveStorageOptionsDocs} -->

Resolve the effective ant-colony storage mode and shared root. Explicit options win, then
environment variables, then extension config, and shared storage is the default when no override is
provided.

<!-- {/antColonyResolveStorageOptionsDocs} -->

<!-- {@antColonyGetColonyStateParentDirDocs} -->

Resolve the parent directory for persisted colony state. Shared mode stores state under the
workspace-mirrored shared root in `colonies/`, while project mode keeps using the legacy local
`.ant-colony/` directory.

<!-- {/antColonyGetColonyStateParentDirDocs} -->

<!-- {@antColonyGetColonyWorktreeParentDirDocs} -->

Resolve the parent directory for isolated colony worktrees. Shared mode keeps them under the
workspace-mirrored shared root in `worktrees/`, while project mode places them under the legacy
project-local `.ant-colony/worktrees/` path.

<!-- {/antColonyGetColonyWorktreeParentDirDocs} -->

<!-- {@antColonyMigrateLegacyProjectColoniesDocs} -->

Best-effort migration for legacy project-local colony state. When shared mode is active, existing
`.ant-colony/{colony-id}/` directories are copied into the shared store so resumable colonies keep
working without leaving runtime state in the repo.

<!-- {/antColonyMigrateLegacyProjectColoniesDocs} -->

<!-- {@antColonyPrepareColonyWorkspaceDocs} -->

Prepare the execution workspace for a colony run. When worktree isolation is enabled and git
supports it, the colony gets a fresh isolated worktree on an `ant-colony/...` branch; otherwise it
falls back to the shared working directory and records the reason.

<!-- {/antColonyPrepareColonyWorkspaceDocs} -->

<!-- {@subagentsProjectAgentStorageOverview} -->

Subagents stores project-scope agents and chains in shared pi storage by default under a
workspace-mirrored path, so repositories stay clean while still supporting parent-workspace lookup
for nested projects. Legacy repo-local `.pi/agents/` storage remains available as an explicit
project-mode override.

<!-- {/subagentsProjectAgentStorageOverview} -->

<!-- {@subagentsResolveProjectAgentStorageOptionsDocs} -->

Resolve the effective project-agent storage mode and shared root. Explicit options take precedence,
then environment variables, then extension config, and shared storage is the default when no
override is provided.

<!-- {/subagentsResolveProjectAgentStorageOptionsDocs} -->

<!-- {@subagentsGetSharedProjectAgentsDirDocs} -->

Build the shared directory for project-scope agent and chain definitions. The path combines the
shared root, a mirrored workspace path, and the trailing `agents/` directory so different projects
stay isolated from one another.

<!-- {/subagentsGetSharedProjectAgentsDirDocs} -->

<!-- {@subagentsMigrateLegacyProjectAgentsDocs} -->

Best-effort migration for legacy repo-local project agents. When shared mode is active, discovered
`.pi/agents/` directories are copied into shared storage and the empty legacy `.pi/` directory is
removed when possible.

<!-- {/subagentsMigrateLegacyProjectAgentsDocs} -->

<!-- {@subagentsFindNearestProjectAgentsDirDocs} -->

Find the highest-priority project agents directory for the current workspace. The resolver walks up
parent workspaces, migrates legacy storage when needed, and preserves the same nearest-parent lookup
semantics in both shared and project storage modes.

<!-- {/subagentsFindNearestProjectAgentsDirDocs} -->

<!-- {@extensionsWatchdogConfigOverview} -->

The watchdog extension reads optional runtime protection settings from a JSON config file in the pi
agent directory. That config controls whether sampling is enabled, how frequently samples run, and
which CPU, memory, and event-loop thresholds trigger alerts or safe-mode escalation.

<!-- {/extensionsWatchdogConfigOverview} -->

<!-- {@extensionsWatchdogConfigPathDocs} -->

Path to the optional watchdog JSON config file under the pi agent directory. This is the default
location used for watchdog sampling, threshold overrides, and enable/disable settings.

<!-- {/extensionsWatchdogConfigPathDocs} -->

<!-- {@extensionsLoadWatchdogConfigDocs} -->

Load watchdog config from disk and return a safe object. Missing files, invalid JSON, or malformed
values all fall back to an empty config so runtime monitoring can continue safely.

<!-- {/extensionsLoadWatchdogConfigDocs} -->

<!-- {@extensionsResolveWatchdogThresholdsDocs} -->

Resolve the effective watchdog thresholds by merging optional config overrides onto the built-in
default thresholds.

<!-- {/extensionsResolveWatchdogThresholdsDocs} -->

<!-- {@extensionsResolveWatchdogSampleIntervalMsDocs} -->

Resolve the watchdog sampling interval in milliseconds, clamping configured values into the
supported range and falling back to the default interval when no valid override is provided.

<!-- {/extensionsResolveWatchdogSampleIntervalMsDocs} -->

<!-- {@extensionsSchedulerOverview} -->

The scheduler extension adds recurring checks, one-time reminders, and the LLM-callable
`schedule_prompt` tool so pi can schedule future follow-ups like PR, CI, build, or deployment
checks. Tasks run only while pi is active and idle, and scheduler state is persisted in shared pi
storage using a workspace-mirrored path.

<!-- {/extensionsSchedulerOverview} -->

<!-- {@repoMdtUsageRuleDocs} -->

Use MDT through `pnpm mdt ...`, not a globally installed `mdt` binary. This keeps documentation
reuse commands pinned to the repo's declared `@ifi/mdt` version and makes local runs, CI, and agent
instructions consistent.

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

CI runs `pnpm mdt check` so provider and consumer blocks stay in sync with the repo-pinned MDT
version.

<!-- {/repoMdtCiDocs} -->

<!-- {@extensionsUsageTrackerOverview} -->

The usage-tracker extension is a CodexBar-inspired provider quota and cost monitor for pi. It
shows provider-level rate limits for Anthropic, OpenAI, and Google using pi-managed auth, while
also tracking per-model token usage and session costs locally.

<!-- {/extensionsUsageTrackerOverview} -->

<!-- {@extensionsUsageTrackerPersistenceDocs} -->

Usage-tracker persists rolling 30-day cost history and the last known provider rate-limit snapshot
under the pi agent directory. That lets the widget and dashboard survive restarts and keep showing
recent subscription windows when a live provider probe is temporarily rate-limited or unavailable.

<!-- {/extensionsUsageTrackerPersistenceDocs} -->

<!-- {@extensionsUsageTrackerCommandsDocs} -->

Key usage-tracker surfaces:

- widget above the editor for at-a-glance quotas and session totals
- `/usage` for the full dashboard overlay
- `Ctrl+U` as a shortcut for the same overlay
- `/usage-toggle` to show or hide the widget
- `/usage-refresh` to force fresh provider probes
- `usage_report` so the agent can answer quota and spend questions directly

<!-- {/extensionsUsageTrackerCommandsDocs} -->

<!-- {@extensionsSchedulerOwnershipDocs} -->

The scheduler distinguishes between instance-scoped tasks and workspace-scoped tasks. Instance
scope is the default for `/loop`, `/remind`, and `schedule_prompt`, which means tasks stay owned by
one pi instance and other instances restore them for review instead of auto-running them.
Workspace scope is an explicit opt-in for shared CI/build/deploy monitors that should survive
instance changes in the same repository.

<!-- {/extensionsSchedulerOwnershipDocs} -->

<!-- {@extensionsWatchdogAlertBehaviorDocs} -->

The watchdog samples CPU, memory, and event-loop lag on an interval, records recent samples and
alerts, and can escalate into safe mode automatically when repeated alerts indicate sustained UI
churn or lag. Toast notifications are intentionally capped per session; ongoing watchdog state is
kept visible in the status bar and the `/watchdog` overlay instead of repeatedly spamming the
terminal.

<!-- {/extensionsWatchdogAlertBehaviorDocs} -->
