#!/usr/bin/env bash
# Prints the `version` of the root package.json: the version of the first release, used while
# no vX.Y.Z tag exists yet.
set -euo pipefail
manifest="${1:-package.json}"
version=$(jq -r '.version // empty' "$manifest")
if [ -z "$version" ]; then
  echo "no version in $manifest" >&2
  exit 1
fi
echo "$version"
