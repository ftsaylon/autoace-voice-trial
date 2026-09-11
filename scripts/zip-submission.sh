#!/bin/sh
# Build the evaluator zip without internal notes.
set -eu
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
out="${1:-"$root/autoace-trial-deliverables.zip"}"
rm -f "$out"
(
  cd "$root/submission"
  zip -r "$out" . \
    -x "internal/*" \
    -x "internal/**" \
    -x "*.DS_Store"
)
echo "Wrote $out"
