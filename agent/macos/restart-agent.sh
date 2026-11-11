#!/bin/sh
set -e
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo' >&2; exit 1; }
base='/Library/Application Support/ElegantSolution'
"$base/bin/elegant-agent-maintenance" RESTART_AGENT
launchctl kickstart -k system/com.elegantsolution.agent.machine
