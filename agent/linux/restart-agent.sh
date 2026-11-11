#!/bin/sh
set -e
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo' >&2; exit 1; }
/usr/lib/elegant-agent/elegant-agent-maintenance RESTART_AGENT
systemctl restart elegant-agent.service
