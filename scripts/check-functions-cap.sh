#!/usr/bin/env bash
# Fails CI if api/ has more routed functions than the configured cap.
# Vercel Hobby caps at 12; Pro is uncapped but we still want a sanity
# ceiling so a careless commit doesn't suddenly blow up the cold-start
# surface area.
#
# Routed = .ts files inside api/ that aren't under an underscore-prefixed
# directory (matches Vercel's own routing rule).

set -euo pipefail

CAP="${BQ_FUNCTION_CAP:-12}"

# Count .ts files under api/ excluding any directory whose name starts
# with `_` (api/_lib, api/_classes, etc. are import-only).
COUNT=$(find api -name "*.ts" -not -path "*/_*" 2>/dev/null | wc -l | tr -d ' ')

if [ "$COUNT" -gt "$CAP" ]; then
  echo "❌ Too many routed functions: $COUNT (cap is $CAP)"
  echo "Move handlers to api/_<dir>/ and dispatch from a single [action].ts."
  find api -name "*.ts" -not -path "*/_*" | sort
  exit 1
fi

echo "✅ Routed functions: $COUNT / $CAP"
