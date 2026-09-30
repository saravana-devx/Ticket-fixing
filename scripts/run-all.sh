#!/usr/bin/env bash
# Run the pipeline on every ticket in ../Test-app/tickets, one after another.
# Test-app is reset to origin/main before each ticket so every fix starts from the buggy code
# (each run still pushes its own auto-fix/* branch). A failing ticket does not stop the batch.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

TICKETS_DIR="../Test-app/tickets"
START=$(date -u '+%Y-%m-%d %H:%M:%S')
FAILED=()

for f in "$TICKETS_DIR"/ticket-*.json; do
  name=$(basename "$f")
  echo
  echo "=================== $name ==================="
  ./scripts/reset-target.sh
  if ! docker compose run --rm -T -e LOCAL_TICKET_PATH="$TICKETS_DIR/$name" agent npm start; then
    echo ">>> $name: pipeline crashed (see error above)"
    FAILED+=("$name")
  fi
done

./scripts/reset-target.sh >/dev/null
echo
echo "=================== SUMMARY (runs since $START UTC) ==================="
docker compose run --rm -T agent node -e "
const D=require('better-sqlite3');const d=new D('data/agent_runs.db',{readonly:true});
console.table(d.prepare(\"SELECT ticket_id, status, estimated_lines AS est_lines, retry_count AS tries, COALESCE(pr_url, child_ticket_url) AS url, ROUND(duration_ms/1000.0) AS secs FROM agent_runs WHERE started_at >= ? ORDER BY started_at\").all('$START'))"
[ ${#FAILED[@]} -eq 0 ] || echo "Crashed tickets: ${FAILED[*]}"
