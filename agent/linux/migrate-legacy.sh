#!/bin/sh
set -eu
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo' >&2; exit 1; }
[ "$#" -eq 1 ] || { echo 'Usage: elegant-agent-migrate-legacy <desktop-username>' >&2; exit 2; }
username="$1"
getent passwd "$username" >/dev/null || { echo 'Unknown user' >&2; exit 1; }
home_dir="$(getent passwd "$username" | cut -d: -f6)"
source_file="$home_dir/.config/elegant-solution/agent/config.json"
destination='/var/lib/elegant-agent/config.json'
[ -f "$source_file" ] && [ ! -L "$source_file" ] || { echo 'Legacy config missing or symlinked' >&2; exit 1; }
[ ! -e "$destination" ] || { echo 'Machine config already exists; refusing overwrite' >&2; exit 1; }
[ "$(stat -c %U "$source_file")" = "$username" ] || { echo 'Legacy config owner mismatch' >&2; exit 1; }
systemctl stop elegant-agent.service
install -d -o elegant-agent -g elegant-agent -m 0700 /var/lib/elegant-agent
install -o elegant-agent -g elegant-agent -m 0600 "$source_file" "$destination"
legacy_autostart="$home_dir/.config/autostart/elegant-solution-agent.desktop"
if [ -f "$legacy_autostart" ] && [ ! -L "$legacy_autostart" ]; then
    mv "$legacy_autostart" "$legacy_autostart.disabled-by-0.5.0"
fi
systemctl start elegant-agent.service
echo 'Legacy machine registration copied; source config retained. Log out and back in before using the new UI.'
