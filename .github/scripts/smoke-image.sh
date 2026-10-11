#!/usr/bin/env bash
# Starts a Mewte image and waits for it to answer the health check.
#
#   smoke-image.sh <image>
#
# The container runs with the image defaults (SQLite in /data) and is removed afterwards. Its log
# is printed when it does not become healthy within 30 seconds.
set -euo pipefail

image="${1:?usage: smoke-image.sh <image>}"
name="mewte-smoke-$$"

docker run -d --name "$name" -p 127.0.0.1:3000:3000 "$image" > /dev/null
trap 'docker rm -f "$name" > /dev/null' EXIT

for _ in $(seq 1 30); do
  if curl -fs http://127.0.0.1:3000/api/health; then
    echo
    exit 0
  fi
  sleep 1
done

docker logs "$name"
echo "smoke-image: $image did not answer /api/health" >&2
exit 1
