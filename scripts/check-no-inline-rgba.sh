#!/usr/bin/env bash
# Phase 4 design-system guard: warns when components inline raw RGBA
# values into style={{...}} props. The right alternative is one of:
#   • <Chip tone="warn">…</Chip>  — for tinted pills/chips
#   • <Card border="left-warn">…</Card>  — for accent cards
#   • style={{background: "var(--warn-tint)"}}  — when a primitive
#     doesn't fit. Reads from CSS custom properties so theme changes
#     propagate.
#
# Existing offenders are recorded in the BASELINE list. CI fails only
# when a new file outside the baseline introduces an inline rgba(.
# This is a "no new debt" check — not a one-shot purge.

set -euo pipefail

# Files allowed to keep their inline rgba(...) — pre-Phase-4 surface area
# we haven't refactored yet. Remove from this list as components migrate
# to design primitives.
BASELINE=(
  "src/App.tsx"
  "src/components/AuthButton.tsx"
  "src/components/CasePlay.tsx"
  "src/components/DeepDive.tsx"
  "src/components/Confetti.tsx"
  "src/components/Icons.tsx"
  "src/components/SubscriptionPanel.tsx"
)

# Match: style={{ ... rgba( ... — both single- and multi-prop styles.
PATTERN='style=\{\{[^}]*rgba\('

# All TS/TSX under src/ except design tokens themselves (where the
# rgba strings legitimately live as the source of truth).
ALL_FILES=$(find src -type f \( -name "*.ts" -o -name "*.tsx" \) -not -path "src/design/*")

OFFENDERS=""
for f in $ALL_FILES; do
  # Skip baseline files
  skip=false
  for b in "${BASELINE[@]}"; do
    if [ "$f" = "$b" ]; then skip=true; break; fi
  done
  $skip && continue

  if grep -lE "$PATTERN" "$f" >/dev/null 2>&1; then
    OFFENDERS="$OFFENDERS\n  $f"
  fi
done

if [ -n "$OFFENDERS" ]; then
  echo "❌ New files with inline rgba() in style props:"
  echo -e "$OFFENDERS"
  echo ""
  echo "Use a design primitive instead:"
  echo "  • <Chip tone=\"warn|ok|err|info|neutral\">…</Chip>"
  echo "  • <Card border=\"left-warn\">…</Card>"
  echo "  • style={{background: \"var(--warn-tint)\"}}  (CSS variable)"
  echo ""
  echo "If the file is legitimately part of a planned migration, add it"
  echo "to BASELINE in scripts/check-no-inline-rgba.sh."
  exit 1
fi

echo "✅ No new inline rgba() in style props outside the baseline."
