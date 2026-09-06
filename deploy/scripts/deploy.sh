#!/usr/bin/env bash
# Deploy / update Nexa on a Tencent Cloud Linux host (Docker Compose).
# Usage: ./deploy/scripts/deploy.sh [up|migrate|pull|restart|logs|status]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.production.yml --env-file .env.production)
ACTION="${1:-up}"

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production — copy from .env.production.example and fill secrets."
  exit 1
fi

case "$ACTION" in
  up)
    echo "[deploy] build + up"
    "${COMPOSE[@]}" build web worker
    "${COMPOSE[@]}" --profile tools run --rm migrate
    "${COMPOSE[@]}" up -d postgres redis searxng web worker
    ./deploy/scripts/health-check.sh || true
    ;;
  migrate)
    "${COMPOSE[@]}" --profile tools run --rm migrate
    ;;
  pull)
    git pull --ff-only
    "${COMPOSE[@]}" build web worker
    "${COMPOSE[@]}" --profile tools run --rm migrate
    "${COMPOSE[@]}" up -d web worker
    ;;
  restart)
    "${COMPOSE[@]}" restart web worker
    ;;
  logs)
    "${COMPOSE[@]}" logs -f --tail=200 web worker
    ;;
  status)
    "${COMPOSE[@]}" ps
    ;;
  rollback)
    echo "Rollback: checkout previous git tag/commit, then: $0 pull"
    echo "Or: docker compose ... up -d with a previously tagged image."
    exit 1
    ;;
  *)
    echo "Usage: $0 {up|migrate|pull|restart|logs|status}"
    exit 1
    ;;
esac
