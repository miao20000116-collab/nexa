#!/usr/bin/env bash
# Health check against local or remote Nexa instance.
# Usage: ./deploy/scripts/health-check.sh [base_url]
set -euo pipefail

BASE="${1:-${NEXT_PUBLIC_APP_URL:-http://127.0.0.1:3000}}"
BASE="${BASE%/}"
URL="$BASE/api/health?deep=1"

echo "[health] GET $URL"
HTTP_CODE="$(curl -sS -o /tmp/nexa-health.json -w '%{http_code}' "$URL" || true)"
cat /tmp/nexa-health.json
echo
echo "[health] http=$HTTP_CODE"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[health] FAILED"
  exit 1
fi

# Require ok:true in JSON without jq dependency
if grep -q '"ok":true' /tmp/nexa-health.json || grep -q '"ok": true' /tmp/nexa-health.json; then
  echo "[health] OK"
  exit 0
fi

echo "[health] response missing ok:true"
exit 1
