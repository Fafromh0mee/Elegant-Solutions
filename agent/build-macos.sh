#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[[ "$(uname -s)" == Darwin ]] || { echo 'macOS required' >&2; exit 1; }
[[ -n "${ELEGANT_SERVER_URL:-}" ]] || { echo 'Set ELEGANT_SERVER_URL' >&2; exit 1; }
command -v pkgbuild >/dev/null || { echo 'Xcode Command Line Tools required' >&2; exit 1; }
python_bin="${PYTHON_BIN:-python3.12}"
"$python_bin" -m venv .build-venv-macos
.build-venv-macos/bin/python -m pip install --disable-pip-version-check -r requirements.txt 'PyInstaller==6.11.1'
rm -rf build dist package-macos
.build-venv-macos/bin/python -m PyInstaller --noconfirm --clean --onefile --name elegant-agent-service --paths src src/machine_service.py
.build-venv-macos/bin/python -m PyInstaller --noconfirm --clean --onefile --windowed --name elegant-agent-ui --paths src src/session_ui.py
.build-venv-macos/bin/python -m PyInstaller --noconfirm --clean --onefile --name elegant-agent-maintenance --paths src src/maintenance_cli.py

root=package-macos
mkdir -p "$root/Library/Application Support/ElegantSolution/bin" "$root/Library/LaunchDaemons" "$root/Library/LaunchAgents"
install -m 755 dist/elegant-agent-service "$root/Library/Application Support/ElegantSolution/bin/elegant-agent-service"
install -m 755 dist/elegant-agent-ui "$root/Library/Application Support/ElegantSolution/bin/elegant-agent-ui"
install -m 755 dist/elegant-agent-maintenance "$root/Library/Application Support/ElegantSolution/bin/elegant-agent-maintenance"
install -m 755 macos/uninstall-agent.sh "$root/Library/Application Support/ElegantSolution/bin/uninstall-agent.sh"
install -m 755 macos/restart-agent.sh "$root/Library/Application Support/ElegantSolution/bin/restart-agent.sh"
install -m 644 macos/com.elegantsolution.agent.machine.plist "$root/Library/LaunchDaemons/"
install -m 644 macos/com.elegantsolution.agent.session.plist "$root/Library/LaunchAgents/"
ELEGANT_SERVER_URL="$ELEGANT_SERVER_URL" "$python_bin" -c 'import json,os,pathlib; pathlib.Path("package-macos/Library/Application Support/ElegantSolution/bin/deployment.json").write_text(json.dumps({"server_url":os.environ["ELEGANT_SERVER_URL"].strip().rstrip("/")})+"\n")'

if find "$root" \( -name config.json -o -name '.env*' -o -name '*.pyc' -o -name __pycache__ \) -print -quit | grep -q .; then
    echo 'Forbidden runtime files in package' >&2
    exit 1
fi
arch="$(uname -m)"
pkg="elegant-agent_0.5.0_darwin_${arch}.pkg"
pkgbuild --root "$root" --scripts macos/pkg-scripts --identifier com.elegantsolution.agent --version 0.5.0 --install-location / "$pkg"
shasum -a 256 "$pkg" > "$pkg.sha256"
echo "Built $pkg (unsigned development package)"
