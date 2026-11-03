#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${PILOT_ENV_FILE:-$ROOT_DIR/.env.pilot}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.pilot.yml")
failures=0

echo "Elegant Solution Pilot Check"
echo

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Configuration  FAIL  missing $ENV_FILE"
    exit 1
fi

# The example/env file contains configuration only; loading it here avoids
# printing credentials while allowing the script to honor custom ports/users.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
WEB_PORT="${WEB_PORT:-3000}"
POSTGRES_USER="${POSTGRES_USER:-elegant}"

if "${COMPOSE[@]}" ps --status running --services | grep -qx postgres; then
    echo "PostgreSQL      OK"
else
    echo "PostgreSQL      FAIL"
    failures=1
fi

if curl -fsS "http://127.0.0.1:${WEB_PORT}/api/liveness" | grep -q '"status":"ok"'; then
    echo "Web             OK"
else
    echo "Web             FAIL"
    failures=1
fi

if "${COMPOSE[@]}" exec -T postgres pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
    echo "Database        OK"
else
    echo "Database        FAIL"
    failures=1
fi

if "${COMPOSE[@]}" exec -T face-ai python -c "import json,sys,urllib.request; d=json.load(urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=3)); sys.exit(0 if d.get('status') == 'healthy' and d.get('model_loaded') is True else 1)" >/dev/null 2>&1; then
    echo "Face AI         READY"
else
    echo "Face AI         NOT READY"
    failures=1
fi

exit "$failures"
