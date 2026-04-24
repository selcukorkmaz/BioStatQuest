#!/usr/bin/env bash
# Fails CI if a PR introduces a NEW file containing @ts-nocheck. Existing
# files keep their pragma until they're explicitly migrated; this guard
# stops the type-checked surface from regressing.
#
# Runs against the merge base of the PR (origin/main by default). If we
# can't determine the base (local run with no upstream), exits 0 — better
# to skip than to false-positive.

set -euo pipefail

BASE="${BQ_DIFF_BASE:-origin/main}"

if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  echo "ℹ️  No diff base ($BASE) — skipping @ts-nocheck delta check."
  exit 0
fi

# Files added or modified in this PR that contain @ts-nocheck.
ADDED_FILES=$(git diff --name-only --diff-filter=A "$BASE"...HEAD -- 'src/**/*.ts' 'src/**/*.tsx' 2>/dev/null || true)

if [ -z "$ADDED_FILES" ]; then
  echo "✅ No newly-added .ts/.tsx files in this PR."
  exit 0
fi

OFFENDERS=""
for f in $ADDED_FILES; do
  if [ -f "$f" ] && head -5 "$f" | grep -q "@ts-nocheck"; then
    OFFENDERS="$OFFENDERS\n  $f"
  fi
done

if [ -n "$OFFENDERS" ]; then
  echo "❌ New files must not use @ts-nocheck:"
  echo -e "$OFFENDERS"
  echo ""
  echo "Existing @ts-nocheck files are tracked separately and will be"
  echo "migrated in Phase 2 of the master plan; new code must be typed."
  exit 1
fi

echo "✅ No new @ts-nocheck pragmas in newly-added files."
