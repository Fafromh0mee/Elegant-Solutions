#!/bin/sh
set -e
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo' >&2; exit 1; }
/usr/lib/elegant-agent/elegant-agent-maintenance UNINSTALL_AGENT
apt-get purge -y elegant-agent
