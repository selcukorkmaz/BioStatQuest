#!/usr/bin/env bash
# Fails CI if the main bundle's gzipped size exceeds the budget. Target is
# tightened phase-by-phase as App.tsx is decomposed:
#   • Phase 1 (today): 280 KB ceiling (current ~248 KB; 30 KB headroom)
#   • Phase 6 (post-extraction): tighten to 200 KB
#   • Long-term: 150 KB
#
# Reads dist/assets/biostatQuest-*.js, gzips it, compares to BUDGET_KB.
# Run after `npm run build`.

set -euo pipefail

BUDGET_KB="${BQ_BUNDLE_BUDGET_KB:-280}"

MAIN_JS=$(ls dist/assets/biostatQuest-*.js 2>/dev/null | head -1 || true)

if [ -z "$MAIN_JS" ]; then
  echo "❌ No main bundle found in dist/assets/. Did the build run?"
  exit 1
fi

# Gzipped size in bytes → KB (rounded).
SIZE_BYTES=$(gzip -c "$MAIN_JS" | wc -c | tr -d ' ')
SIZE_KB=$(( (SIZE_BYTES + 512) / 1024 ))

echo "Main bundle: $MAIN_JS"
echo "Gzipped: ${SIZE_KB} KB (budget: ${BUDGET_KB} KB)"

if [ "$SIZE_KB" -gt "$BUDGET_KB" ]; then
  echo "❌ Bundle exceeds budget by $(( SIZE_KB - BUDGET_KB )) KB."
  echo "Either extract a view to a lazy chunk or raise BQ_BUNDLE_BUDGET_KB."
  exit 1
fi

echo "✅ Bundle within budget (${BUDGET_KB} KB)."
