#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(uname -s)" != "Linux" ]]; then
    echo "ERROR: install.sh supports Linux only." >&2
    exit 1
fi
if [[ "$(uname -m)" != "x86_64" && "$(uname -m)" != "amd64" ]]; then
    echo "ERROR: this pilot supports Linux x86-64 only." >&2
    exit 1
fi

if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "Detected: ${PRETTY_NAME:-Linux}"
    if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "22.04" && "${VERSION_ID:-}" != "24.04" ]]; then
        echo "WARNING: Ubuntu 22.04 and 24.04 are the primary pilot targets."
    fi
fi

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "ERROR: python3 is required." >&2
    exit 1
fi
if ! "$PYTHON_BIN" -c 'import tkinter' >/dev/null 2>&1; then
    echo "ERROR: Tkinter is required. On Ubuntu install python3-tk." >&2
    exit 1
fi
if ! "$PYTHON_BIN" -m venv --help >/dev/null 2>&1; then
    echo "ERROR: Python venv support is required. On Ubuntu install python3-venv." >&2
    exit 1
fi

if find "$SCRIPT_DIR" \( \
    -name 'config.json' -o -name '.env' -o -name '.env.*' -o \
    -name '*.pyc' -o -name '__pycache__' -o -name '.DS_Store' -o \
    -name '*.exe' -o -name '*.bat' -o -name '*.ps1' \
  \) -print -quit | grep -q .; then
    echo "ERROR: release contains forbidden runtime or Windows artifacts." >&2
    exit 1
fi

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
INSTALL_DIR="$DATA_HOME/elegant-solution/agent"
CONFIG_DIR="$CONFIG_HOME/elegant-solution/agent"
STATE_DIR="$STATE_HOME/elegant-solution/agent"
LOG_DIR="$STATE_DIR/logs"
AUTOSTART_DIR="$CONFIG_HOME/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/elegant-solution-agent.desktop"
PID_FILE="$STATE_DIR/agent.pid"

process_matches() {
    local pid="$1"
    [[ "$pid" =~ ^[0-9]+$ ]] || return 1
    [[ -r "/proc/$pid/cmdline" ]] || return 1
    tr '\0' ' ' < "/proc/$pid/cmdline" | grep -Fq "$INSTALL_DIR/src/main.py"
}

stop_existing_agent() {
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
    rm -f "$PID_FILE"
}

if [[ ! -f "$SCRIPT_DIR/src/main.py" || ! -f "$SCRIPT_DIR/requirements.txt" || ! -f "$SCRIPT_DIR/deployment.json" ]]; then
    echo "ERROR: incomplete Linux Agent release." >&2
    exit 1
fi

echo "Installing to $INSTALL_DIR"
stop_existing_agent
mkdir -p "$INSTALL_DIR/src" "$CONFIG_DIR" "$LOG_DIR" "$AUTOSTART_DIR"
chmod 700 "$CONFIG_DIR" "$STATE_DIR" "$LOG_DIR"

if [[ ! -x "$INSTALL_DIR/venv/bin/python" ]]; then
    "$PYTHON_BIN" -m venv "$INSTALL_DIR/venv"
fi
"$INSTALL_DIR/venv/bin/python" -m pip install \
    --disable-pip-version-check \
    --requirement "$SCRIPT_DIR/requirements.txt"

rm -rf "$INSTALL_DIR/src"
mkdir -p "$INSTALL_DIR/src"
while IFS= read -r -d '' source_file; do
    relative_path="${source_file#"$SCRIPT_DIR/src/"}"
    target_file="$INSTALL_DIR/src/$relative_path"
    mkdir -p "$(dirname "$target_file")"
    cp "$source_file" "$target_file"
done < <(find "$SCRIPT_DIR/src" -type f -name '*.py' -print0)
cp "$SCRIPT_DIR/run-agent.sh" "$INSTALL_DIR/run-agent.sh"
cp "$SCRIPT_DIR/deployment.json" "$INSTALL_DIR/deployment.json"
chmod 755 "$INSTALL_DIR/run-agent.sh"
chmod -R u=rwX,go=rX "$INSTALL_DIR/src"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Elegant Solutions Agent
Comment=Elegant Solutions Tracking Agent
Exec="$INSTALL_DIR/run-agent.sh"
TryExec=$INSTALL_DIR/run-agent.sh
Terminal=false
X-GNOME-Autostart-enabled=true
EOF
chmod 644 "$DESKTOP_FILE"

if [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]]; then
    nohup "$INSTALL_DIR/run-agent.sh" >/dev/null 2>&1 &
    echo "Agent started for the current graphical session."
else
    echo "No graphical session detected; Agent will start at the next desktop login."
fi

echo "Installation complete. No existing config.json was copied."
