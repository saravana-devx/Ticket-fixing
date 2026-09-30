#!/usr/bin/env bash
# Reset the target repo (../Test-app) to a pristine copy of origin/main so the bugs are back:
# drops local auto-fix/* branches and working-tree changes. Never touches the remote.
set -euo pipefail

TARGET="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/Test-app"
cd "$TARGET"

git fetch -q origin
git checkout -q -f main
git reset -q --hard origin/main
git clean -fdq -e node_modules -e dist
git for-each-ref --format='%(refname:short)' refs/heads/ | { grep -v '^main$' || true; } | xargs -r git branch -D -q
echo "Test-app reset to origin/main ($(git rev-parse --short HEAD))"
