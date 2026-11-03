#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
STATE_DIR="$STATE_HOME/elegant-solution/agent"
PID_FILE="$STATE_DIR/agent.pid"

mkdir -p "$STATE_DIR"

cleanup() {
    rm -f "$PID_FILE"
}

forward_signal() {
    if [[ -n "${AGENT_PID:-}" ]]; then
        kill -TERM "$AGENT_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT
trap forward_signal INT TERM

"$INSTALL_DIR/venv/bin/python" "$INSTALL_DIR/src/main.py" &
AGENT_PID=$!
printf '%s\n' "$AGENT_PID" > "$PID_FILE"
wait "$AGENT_PID"
