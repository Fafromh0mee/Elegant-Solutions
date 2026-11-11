#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo 'Linux x86-64 required' >&2; exit 1; }
[[ -n "${ELEGANT_SERVER_URL:-}" ]] || { echo 'Set ELEGANT_SERVER_URL' >&2; exit 1; }
command -v dpkg-deb >/dev/null || { echo 'Install dpkg-dev on the build host' >&2; exit 1; }

python3 -m venv .build-venv
.build-venv/bin/python -m pip install --disable-pip-version-check -r requirements.txt 'PyInstaller==6.11.1'
rm -rf build dist package-linux
.build-venv/bin/python -m PyInstaller --noconfirm --clean --onefile --name elegant-agent-service --paths src src/machine_service.py
.build-venv/bin/python -m PyInstaller --noconfirm --clean --onefile --windowed --name elegant-agent-ui --paths src src/session_ui.py
.build-venv/bin/python -m PyInstaller --noconfirm --clean --onefile --name elegant-agent-maintenance --paths src src/maintenance_cli.py

root=package-linux
mkdir -p "$root/DEBIAN" "$root/usr/lib/elegant-agent" "$root/usr/sbin" "$root/lib/systemd/system" "$root/etc/xdg/autostart"
install -m 755 dist/elegant-agent-service "$root/usr/lib/elegant-agent/elegant-agent-service"
install -m 755 dist/elegant-agent-ui "$root/usr/lib/elegant-agent/elegant-agent-ui"
install -m 755 dist/elegant-agent-maintenance "$root/usr/lib/elegant-agent/elegant-agent-maintenance"
install -m 755 linux/uninstall-agent.sh "$root/usr/sbin/elegant-agent-uninstall"
install -m 755 linux/restart-agent.sh "$root/usr/sbin/elegant-agent-restart"
install -m 755 linux/migrate-legacy.sh "$root/usr/sbin/elegant-agent-migrate-legacy"
install -m 644 linux/elegant-agent.service "$root/lib/systemd/system/elegant-agent.service"
install -m 644 linux/elegant-agent.desktop "$root/etc/xdg/autostart/elegant-agent.desktop"
install -m 755 linux/postinst linux/prerm linux/postrm "$root/DEBIAN/"
ELEGANT_SERVER_URL="$ELEGANT_SERVER_URL" python3 -c 'import json,os,pathlib; pathlib.Path("package-linux/usr/lib/elegant-agent/deployment.json").write_text(json.dumps({"server_url":os.environ["ELEGANT_SERVER_URL"].strip().rstrip("/")})+"\n")'
cat > "$root/DEBIAN/control" <<'EOF'
Package: elegant-agent
Version: 0.5.0
Section: admin
Priority: optional
Architecture: amd64
Maintainer: Elegant Solution <noreply@example.invalid>
Depends: libc6, libstdc++6
Description: Elegant Solution machine and desktop Tracking Agent
EOF

if find "$root" \( -name config.json -o -name '.env*' -o -name '*.pyc' -o -name __pycache__ \) -print -quit | grep -q .; then
    echo 'Forbidden runtime files in package' >&2
    exit 1
fi
dpkg-deb --build "$root" elegant-agent_0.5.0_amd64.deb
sha256sum elegant-agent_0.5.0_amd64.deb > elegant-agent_0.5.0_amd64.deb.sha256
echo 'Built elegant-agent_0.5.0_amd64.deb'
