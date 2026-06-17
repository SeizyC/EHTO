#!/usr/bin/env bash
# Run arbitrary SQL against the EHTO Supabase project via Management API.
#
# Usage:
#   ./scripts/db.sh -f supabase/migrations/some.sql
#   ./scripts/db.sh -q "select count(*) from public.characters"
#   ./scripts/db.sh < heredoc.sql

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  set -a; . "$ROOT/.env.local"; set +a
fi
REF="${SUPABASE_PROJECT_REF:-rpduzhpnkcwrfeqsqdlp}"
ENDPOINT="https://api.supabase.com/v1/projects/$REF/database/query"

QUERY=""
if [ "${1:-}" = "-f" ] && [ -n "${2:-}" ]; then
  QUERY=$(cat "$2")
elif [ "${1:-}" = "-q" ] && [ -n "${2:-}" ]; then
  QUERY="$2"
else
  # stdin
  QUERY=$(cat)
fi

if [ -z "$QUERY" ]; then
  echo "no SQL provided" >&2
  exit 1
fi

PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$QUERY")

RESP=$(curl -sS -w "\n__HTTP__%{http_code}" -X POST "$ENDPOINT" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
CODE=$(echo "$RESP" | grep -o '__HTTP__[0-9]*' | sed 's/__HTTP__//')
BODY=$(echo "$RESP" | sed 's/__HTTP__[0-9]*//')

if [ "$CODE" != "200" ] && [ "$CODE" != "201" ]; then
  echo "HTTP $CODE" >&2
  echo "$BODY" >&2
  exit 2
fi

echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
