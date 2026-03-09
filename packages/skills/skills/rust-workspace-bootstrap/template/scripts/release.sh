#!/usr/bin/env bash
set -euo pipefail

# Local release helper for __PROJECT_NAME__
#
# Usage:
#   ./scripts/release.sh
#   ./scripts/release.sh --dry-run
#
# This script validates the workspace, then delegates versioning/tagging/changelog
# orchestration to `knope release`.

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "🏃 Dry run mode — no repository changes will be made"
fi

echo "📋 Checking prerequisites..."
command -v knope >/dev/null 2>&1 || {
  echo "❌ knope not found. Install with cargo-binstall or nix/devenv."
  exit 1
}
command -v cargo >/dev/null 2>&1 || {
  echo "❌ cargo not found."
  exit 1
}

echo "📋 Checking working tree..."
if [[ -n $(git status --porcelain) ]] && [[ -z "$DRY_RUN" ]]; then
  echo "❌ Working tree is dirty. Commit or stash your changes first."
  exit 1
fi

echo "📋 Checking for pending changesets..."
CHANGESET_COUNT=$(find .changeset -name '*.md' ! -name 'README.md' 2>/dev/null | wc -l | tr -d ' ')
if [[ "$CHANGESET_COUNT" -eq 0 ]]; then
  echo "❌ No changesets found. Run 'knope document-change' first."
  exit 1
fi

echo ""
echo "🔍 Running quality checks..."
if command -v devenv >/dev/null 2>&1; then
  devenv shell -c -- bash -e -c 'lint:all && test:all && build:all'
else
  cargo clippy --workspace --all-features --all-targets --locked
  cargo test --workspace --all-features --locked
  cargo build --workspace --all-features --locked
fi

echo ""
echo "🚀 Running knope release..."
knope release $DRY_RUN

echo ""
if [[ -z "$DRY_RUN" ]]; then
  echo "✅ Release complete"
else
  echo "✅ Dry run complete — no changes made"
fi
