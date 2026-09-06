#!/usr/bin/env bash
# Restore PostgreSQL from a gzipped dump created by backup-postgres.sh
# Usage: ./deploy/scripts/restore-postgres.sh backups/postgres/nexa_YYYYMMDD.sql.gz
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 path/to/nexa_*.sql.gz"
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.production.yml --env-file .env.production)

echo "[restore] WARNING: this replaces database contents from $DUMP"
read -r -p "Type RESTORE to continue: " confirm
[[ "$confirm" == "RESTORE" ]] || { echo "Aborted"; exit 1; }

"${COMPOSE[@]}" up -d postgres
sleep 3

echo "[restore] dropping/recreating public schema objects via psql"
gunzip -c "$DUMP" | "${COMPOSE[@]}" exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'

echo "[restore] complete — restart web/worker"
"${COMPOSE[@]}" restart web worker
