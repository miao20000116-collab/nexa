#!/usr/bin/env bash
# Backup PostgreSQL from docker-compose.production stack.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-$ROOT/backups/postgres}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/nexa_${STAMP}.sql.gz"

COMPOSE=(docker compose -f docker-compose.production.yml --env-file .env.production)

echo "[backup] dumping to $FILE"
"${COMPOSE[@]}" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --format=plain' \
  | gzip -c > "$FILE"

echo "[backup] done: $FILE ($(du -h "$FILE" | cut -f1))"
# Retain last 14 backups locally
ls -1t "$OUT_DIR"/nexa_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
