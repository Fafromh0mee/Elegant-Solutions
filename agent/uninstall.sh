#!/usr/bin/env bash
set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
INSTALL_DIR="$DATA_HOME/elegant-solution/agent"
CONFIG_DIR="$CONFIG_HOME/elegant-solution/agent"
STATE_DIR="$STATE_HOME/elegant-solution/agent"
PID_FILE="$STATE_DIR/agent.pid"
DESKTOP_FILE="$CONFIG_HOME/autostart/elegant-solution-agent.desktop"

read -r -p "Enter the server-issued UNINSTALL_AGENT Maintenance Code: " MAINT_CODE
if [[ ! "$MAINT_CODE" =~ ^[0-9]{6}$ ]]; then
    echo "ERROR: a six-digit Maintenance Code is required." >&2
    exit 1
fi
if [[ ! -r "$CONFIG_DIR/config.json" ]]; then
    echo "ERROR: Agent configuration was not found." >&2
    exit 1
fi

AUTH_RESULT="$(MAINT_CODE="$MAINT_CODE" CONFIG_PATH="$CONFIG_DIR/config.json" python3 -c '
import json, os, sys, urllib.error, urllib.request
try:
    with open(os.environ["CONFIG_PATH"], encoding="utf-8") as handle:
        cfg = json.load(handle)
    payload = json.dumps({"code": os.environ["MAINT_CODE"], "action": "UNINSTALL_AGENT"}).encode()
    request = urllib.request.Request(
        cfg["server_url"].rstrip("/") + "/api/agent/maintenance/authorize",
        data=payload,
        headers={"Content-Type": "application/json", "x-agent-key": cfg["api_key"]},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        result = json.load(response)
    if result.get("authorized"):
        print("OK")
except Exception:
    sys.exit(1)
')"
if [[ "$AUTH_RESULT" != "OK" ]]; then
    echo "ERROR: Server rejected the Maintenance Code." >&2
    exit 1
fi
echo "Maintenance authorization accepted."

process_matches() {
    local pid="$1"
    [[ "$pid" =~ ^[0-9]+$ ]] || return 1
    [[ -r "/proc/$pid/cmdline" ]] || return 1
    tr '\0' ' ' < "/proc/$pid/cmdline" | grep -Fq "$INSTALL_DIR/src/main.py"
}

stop_agent() {
    local pids=()
    if [[ -f "$PID_FILE" ]]; then
        pids+=("$(<"$PID_FILE")")
    fi
    for proc_dir in /proc/[0-9]*; do
        [[ -r "$proc_dir/cmdline" ]] || continue
        pids+=("${proc_dir##*/}")
    done

    local pid
    for pid in "${pids[@]}"; do
        if [[ "$pid" != "$$" ]] && process_matches "$pid"; then
            kill "$pid" 2>/dev/null || true
        fi
    done

    for pid in "${pids[@]}"; do
        if [[ "$pid" != "$$" ]] && process_matches "$pid"; then
            for _ in {1..10}; do
                kill -0 "$pid" 2>/dev/null || break
                sleep 1
            done
            if kill -0 "$pid" 2>/dev/null; then
                kill -KILL "$pid" 2>/dev/null || true
            fi
        fi
    done
}

stop_agent
rm -f "$PID_FILE" "$DESKTOP_FILE"
rm -rf "$INSTALL_DIR" "$CONFIG_DIR" "$STATE_DIR"

# Remove only empty Agent-owned parent directories; unrelated user files remain.
rmdir "$CONFIG_HOME/autostart" 2>/dev/null || true
rmdir "$CONFIG_HOME/elegant-solution" 2>/dev/null || true
rmdir "$STATE_HOME/elegant-solution" 2>/dev/null || true
rmdir "$DATA_HOME/elegant-solution" 2>/dev/null || true

echo "Elegant Solutions Agent uninstalled for this user."
