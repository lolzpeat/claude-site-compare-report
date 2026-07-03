#!/usr/bin/env bash
# Shrink output/shots screenshots for a lighter Vercel deploy.
#
# Full-page PNGs (~1440px wide, ~800KB avg) dominate the deploy size. This moves each
# original PNG to output/shots-full/ (git+vercel-ignored) and writes a downscaled JPEG
# back to output/shots/ under the SAME .png filename. Browsers content-sniff <img>, so
# the report's hardcoded ...-mig.png / ...-orig.png refs keep working with no code change.
#
# Re-runnable: it always re-encodes from the pristine original in shots-full/ (backing it
# up on first sight), so you can rerun with a different width/quality any time. Full-page
# shots are tall, so we cap WIDTH (not the longest side) and let height scale — the report
# scrolls each shot vertically, so width is what governs legibility.
# Re-running capture overwrites shots/ with fresh PNGs; just re-run this before deploying.
#
# Usage: bash scripts/optimize-shots.sh [width] [quality]   (defaults: 1000 70)
set -euo pipefail

WIDTH="${1:-1000}"
Q="${2:-70}"
SHOTS="output/shots"
FULL="output/shots-full"

[ -d "$SHOTS" ] || { echo "no $SHOTS/ — run capture+report first"; exit 1; }
command -v sips >/dev/null || { echo "sips not found (macOS only)"; exit 1; }
mkdir -p "$FULL"

export WIDTH Q FULL
optimize_one() {
  f="$1"
  name="$(basename "$f")"
  src="$FULL/$name"
  # First sight: preserve the pristine original. Otherwise re-encode from it.
  [ -f "$src" ] || cp "$f" "$src"
  # Cap width to WIDTH (aspect preserved; height scales) and re-encode as JPEG.
  if ! sips --resampleWidth "$WIDTH" -s format jpeg -s formatOptions "$Q" "$src" --out "$f" >/dev/null 2>&1; then
    echo "FAILED: $name" >&2
    return 1
  fi
}
export -f optimize_one

before=$(du -sm "$SHOTS" 2>/dev/null | awk '{print $1}')
count=$(find "$SHOTS" -maxdepth 1 -name '*.png' | wc -l | tr -d ' ')
echo "optimizing $count shots → width ${WIDTH}px, JPEG q${Q} (parallel)…"

find "$SHOTS" -maxdepth 1 -name '*.png' -print0 \
  | xargs -0 -P 6 -I{} bash -c 'optimize_one "$@"' _ {}

after=$(du -sm "$SHOTS" 2>/dev/null | awk '{print $1}')
echo "done: $SHOTS ${before}MB → ${after}MB (originals preserved in $FULL/)"
