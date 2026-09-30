#!/bin/sh
# node_modules lives in a named volume, so it doesn't follow package.json changes on its own.
# Reinstall automatically whenever package-lock.json changes.
STAMP=/app/node_modules/.lock-hash
HASH=$(md5sum /app/package-lock.json | cut -d' ' -f1)
if [ "$(cat "$STAMP" 2>/dev/null)" != "$HASH" ]; then
  echo "[entrypoint] package-lock.json changed — running npm ci"
  (cd /app && npm ci) && echo "$HASH" > "$STAMP"
fi

# Let git push over https using GITHUB_TOKEN (container-local config only).
if [ -n "$GITHUB_TOKEN" ]; then
  git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
fi
exec "$@"
