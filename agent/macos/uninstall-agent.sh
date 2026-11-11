#!/bin/sh
set -e
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo' >&2; exit 1; }
base='/Library/Application Support/ElegantSolution'
"$base/bin/elegant-agent-maintenance" UNINSTALL_AGENT
launchctl bootout system/com.elegantsolution.agent.machine >/dev/null 2>&1 || true
console_user="$(stat -f %Su /dev/console)"
if [ "$console_user" != root ]; then
    user_id="$(id -u "$console_user")"
    launchctl bootout "gui/$user_id/com.elegantsolution.agent.session" >/dev/null 2>&1 || true
fi
rm -f /Library/LaunchDaemons/com.elegantsolution.agent.machine.plist
rm -f /Library/LaunchAgents/com.elegantsolution.agent.session.plist
rm -rf "$base/Agent" "$base/Bridge"
rm -f "$base/bin/elegant-agent-service" "$base/bin/elegant-agent-ui" \
    "$base/bin/elegant-agent-maintenance" "$base/bin/deployment.json" \
    "$base/bin/restart-agent.sh" "$base/bin/uninstall-agent.sh"
rmdir "$base/bin" "$base" >/dev/null 2>&1 || true
pkgutil --forget com.elegantsolution.agent >/dev/null 2>&1 || true
echo 'Elegant Agent removed'
