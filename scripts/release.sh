#!/usr/bin/env bash
set -euo pipefail

# oh-pi local release script
# Usage: ./scripts/release.sh [--dry-run]
#
# Prerequisites:
#   - monochange (mc)
#   - pnpm
#   - gh (GitHub CLI, authenticated)
#
# What it does:
#   1. Verifies the working tree is clean
#   2. Runs full CI/security checks (lint, security, typecheck, test, build)
#   3. Runs `mc release` to bump versions, update changelogs, commit, tag, push

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
	DRY_RUN="--dry-run"
	echo "🏃 Dry run mode — no changes will be made"
fi

echo "📋 Checking prerequisites..."
command -v mc >/dev/null 2>&1 || {
	echo "❌ monochange (mc) not found. Install: https://github.com/ifiokjr/monochange"
	exit 1
}
command -v pnpm >/dev/null 2>&1 || {
	echo "❌ pnpm not found."
	exit 1
}
command -v gh >/dev/null 2>&1 || {
	echo "❌ gh (GitHub CLI) not found."
	exit 1
}

echo "📋 Checking working tree..."
if [[ -n $(git status --porcelain) ]] && [[ -z "$DRY_RUN" ]]; then
	echo "❌ Working tree is dirty. Commit or stash changes first."
	exit 1
fi

echo "📋 Checking for pending changesets..."
CHANGESET_COUNT=$(find .changeset -name '*.md' ! -name 'README.md' 2>/dev/null | wc -l | tr -d ' ')
if [[ "$CHANGESET_COUNT" -eq 0 ]]; then
	echo "⚠️  No changesets found. Run 'mc change' first."
	exit 1
fi

echo ""
echo "🔍 Running CI checks..."
echo "  → lint"
pnpm lint || {
	echo "❌ oxlint failed"
	exit 1
}
echo "  → security"
pnpm security:check || {
	echo "❌ Security checks failed"
	exit 1
}
echo "  → typecheck"
pnpm --filter @ifi/oh-pi-core build
pnpm typecheck || {
	echo "❌ Type check failed"
	exit 1
}
echo "  → test"
pnpm test || {
	echo "❌ Tests failed"
	exit 1
}
echo "  → build"
pnpm build || {
	echo "❌ Build failed"
	exit 1
}

echo ""
echo "🚀 Running monochange release..."
mc release $DRY_RUN

if [[ -z "$DRY_RUN" ]]; then
	echo ""
	echo "✅ Release complete!"
	echo "   Check: https://github.com/ifiokjr/oh-pi/releases"
else
	echo ""
	echo "✅ Dry run complete — no changes made."
fi