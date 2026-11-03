#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(uname -s)" != "Linux" ]]; then
    echo "ERROR: build-linux.sh must run on Linux." >&2
    exit 1
fi
if [[ "$(uname -m)" != "x86_64" && "$(uname -m)" != "amd64" ]]; then
    echo "ERROR: this pilot supports Linux x86-64 only." >&2
    exit 1
fi
if [[ -z "${ELEGANT_SERVER_URL:-}" ]]; then
    echo "ERROR: Set ELEGANT_SERVER_URL to the deployed non-secret server URL before building." >&2
    exit 1
fi

RELEASE_DIR="$SCRIPT_DIR/release-linux"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/src"

while IFS= read -r -d '' source_file; do
    relative_path="${source_file#"$SCRIPT_DIR/src/"}"
    target_file="$RELEASE_DIR/src/$relative_path"
    mkdir -p "$(dirname "$target_file")"
    cp "$source_file" "$target_file"
done < <(find "$SCRIPT_DIR/src" -type f -name '*.py' -print0)

cp "$SCRIPT_DIR/requirements.txt" "$RELEASE_DIR/requirements.txt"
cp "$SCRIPT_DIR/install.sh" "$RELEASE_DIR/install.sh"
cp "$SCRIPT_DIR/uninstall.sh" "$RELEASE_DIR/uninstall.sh"
cp "$SCRIPT_DIR/run-agent.sh" "$RELEASE_DIR/run-agent.sh"
cp "$SCRIPT_DIR/README.md" "$RELEASE_DIR/README.md"
ELEGANT_SERVER_URL="$ELEGANT_SERVER_URL" python3 -c 'import json, os, pathlib; pathlib.Path("'"$RELEASE_DIR"'/deployment.json").write_text(json.dumps({"server_url": os.environ["ELEGANT_SERVER_URL"].strip().rstrip("/")}, indent=2) + "\n", encoding="utf-8")'
chmod 755 "$RELEASE_DIR/install.sh" "$RELEASE_DIR/uninstall.sh" "$RELEASE_DIR/run-agent.sh"

if find "$RELEASE_DIR" \( \
    -name 'config.json' -o -name '.env' -o -name '.env.*' -o \
    -name '*.pyc' -o -name '__pycache__' -o -name '.DS_Store' -o \
    -name '*.exe' -o -name '*.bat' -o -name '*.ps1' \
  \) -print -quit | grep -q .; then
    echo "ERROR: Linux release contains forbidden files." >&2
    exit 1
fi

echo "Linux pilot release staged at: $RELEASE_DIR"
