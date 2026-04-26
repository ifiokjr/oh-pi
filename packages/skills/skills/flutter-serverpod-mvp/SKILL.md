---
name: flutter-serverpod-mvp
description: Scaffold and evolve full-stack Flutter + Serverpod MVPs using devenv, Riverpod + Hooks,
  strict i18n, and GoRouter shell routing patterns inspired by OpenBudget.
---

# Flutter + Serverpod MVP (OpenBudget-style)

Use this skill when the user wants to:

- start a **new full-stack Flutter + Serverpod project**,
- add a major feature to an existing Flutter + Serverpod monorepo,
- enforce OpenBudget-style rules for **devenv**, **Riverpod + Hooks**, **i18n**, and **routing**.

## Core Standards (non-negotiable)

These conventions are extracted from the OpenBudget setup and should be applied by default.

1. **Workspace-first monorepo**
   - Keep app/server/shared modules in one workspace.
   - Use `melos` scripts from the workspace root.

2. **Hooks + Riverpod architecture**
   - Use `HookConsumerWidget` for widgets that read providers.
   - Use `HookWidget` for widgets without provider reads.
   - Prefer custom hooks (`use*`) over ad-hoc widget state.
   - Use `@riverpod`/`riverpod_annotation` providers, not manual legacy provider styles.

3. **Serverpod full-stack flow**
   - Keep API/domain logic in `server/` with endpoint + service pattern.
   - Generate protocol/client code whenever models/endpoints change.
   - App calls Serverpod via a dedicated `serverpodClientProvider`.

4. **Strict i18n discipline**
   - No hardcoded user-facing strings in UI.
   - Use ARB + generated `AppLocalizations` API.
   - Add and run a hardcoded text checker (OpenBudget-style `tools/check_localized_ui_text.dart`).

5. **Structured GoRouter routing**
   - Route constants in `route_names.dart`.
   - Router provider in `app_router.dart` via `@riverpod`.
   - Auth redirect in a pure/testable helper function.
   - Use `StatefulShellRoute.indexedStack` for bottom-tab apps with separate navigator stacks.

6. **devenv as the operational entrypoint**
   - Local infra (Postgres/Redis) + scripts + process logs under devenv.
   - `devenv up` should bring up backend dependencies and server.

## Recommended Project Layout

```text
<project>/
├── app/                    # Flutter app
├── server/                 # Serverpod backend
├── client/                 # Generated serverpod protocol client
├── core/                   # Shared Dart models/utilities (no Flutter)
├── ui/                     # Shared Flutter UI package
├── lints/                  # Centralized analyzer/lint config (optional but recommended)
├── test_utils/             # Shared test helpers
├── tools/                  # Scripts (e.g. l10n hardcoded text check)
├── pubspec.yaml            # Workspace root + melos config
├── devenv.nix              # Development environment and scripts
├── devenv.yaml             # devenv inputs
└── .github/workflows/ci.yml
```

## Bootstrap Workflow for a New MVP

When asked to create a new project, execute this order:

1. **Collect project inputs**
   - Project name, organization ID, app bundle IDs, default flavor, API hostnames.

2. **Scaffold workspace root**
   - Root `pubspec.yaml` with Dart workspace members.
   - `melos` scripts for analyze/test/generate/serverpod generation.

3. **Scaffold Serverpod package**
   - `server/pubspec.yaml` with `serverpod` dependencies.
   - `server/config/{development,test,production}.yaml`.
   - `server/config/generator.yaml` pointing to `../client`.
   - Initial endpoint/service files.

4. **Scaffold Flutter app package**
   - Dependencies: `hooks_riverpod`, `flutter_hooks`, `go_router`,
     `riverpod_annotation`, `serverpod_flutter`, auth package, localization deps.
   - `l10n.yaml` configured with generated output directory.
   - app bootstrap with `MaterialApp.router`, localization delegates, and router provider.

5. **Wire full-stack client access**
   - Add `serverpodClientProvider` with environment override support.
   - Ensure test runtime handling for connectivity monitor.

6. **Add i18n and routing foundations**
   - `lib/l10n/app_en.arb` + generated localization output path.
   - `route_names.dart` for all route/path constants.
   - `app_router.dart` with auth redirects + shell routing where needed.

7. **Add devenv and CI**
   - `devenv.nix` with scripts for lint/test/generate/server start.
   - `devenv` GitHub composite action + CI jobs for lint/test/server/integration.

8. **Create first vertical slice**
   - Auth + one core domain flow (e.g. projects/tasks/budgets).
   - Endpoint → service → provider → screen.
   - Unit/widget/integration tests for the slice.

## i18n Rules (OpenBudget pattern)

- Keep ARB files under `app/lib/l10n/`.
- Keep generated localization files under `app/lib/l10n/generated/`.
- Use `AppLocalizations.of(context)` for all visible text.
- Add a hardcoded-string checker script and run it in CI (`lint:l10n`).
- Only allow explicit opt-outs with inline comment markers (for rare cases).

Minimal `l10n.yaml` baseline:

```yaml
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
output-dir: lib/l10n/generated
output-class: AppLocalizations
nullable-getter: false
```

## Routing Rules (OpenBudget pattern)

- Keep route names and paths in one constants file.
- Keep router creation inside a provider (`@riverpod GoRouter appRouter(Ref ref)`).
- Keep redirect logic in a separate helper for easy unit tests.
- For tabbed apps, use `StatefulShellRoute.indexedStack` with one navigator key per tab.
- Keep non-tab overlays outside shell branches.

## Provider + UI Rules

- Use feature-oriented modules.
- Follow flow: **endpoint/service (server)** → **client call** → **provider** → **UI widget**.
- Keep side effects in providers/services, not in build methods.
- Handle async UI with `AsyncValue.when` or pattern matching.

## devenv + Commands Contract

Include scripts equivalent to these responsibilities:

- `server:start`
- `runner:build`
- `runner:serverpod`
- `lint:analyze`
- `lint:l10n`
- `lint:all`
- `test:flutter`
- `test:all`

Target dev loop:

```bash
devenv shell
dart pub get
runner:build
runner:serverpod
devenv up
```

## CI Contract

At minimum, CI should run:

1. lint job (`lint:all`)
2. test job (Flutter + Dart/server tests)
3. server job with Postgres/Redis services
4. integration job (if integration tests exist)

Use a reusable setup action to install Nix/devenv, cache pub deps, and install Flutter via FVM.

## Feature Delivery Checklist (for agents)

Before marking work complete:

- [ ] Codegen run (Riverpod/build_runner + Serverpod)
- [ ] Generated files committed
- [ ] No hardcoded UI text
- [ ] New routes declared in `route_names.dart`
- [ ] Router/auth redirect tests updated
- [ ] Provider tests + widget tests added/updated
- [ ] Server endpoint/service tests added/updated
- [ ] `lint:all` and relevant tests passing

## What to produce when user asks for a "new MVP"

Always produce:

1. full folder skeleton,
2. root workspace config (`pubspec.yaml` + melos scripts),
3. app bootstrap + router + localization scaffolding,
4. serverpod config + initial endpoint/service,
5. devenv + CI baseline,
6. one implemented end-to-end feature slice with tests.
