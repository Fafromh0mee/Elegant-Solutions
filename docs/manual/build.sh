#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v tectonic >/dev/null || { echo 'ต้องติดตั้ง tectonic ก่อน build' >&2; exit 1; }
tectonic --keep-logs main.tex
mv -f main.pdf Elegant_Solution_Complete_Manual.pdf
pdfinfo Elegant_Solution_Complete_Manual.pdf | grep -E 'Pages:|Page size:|File size:'
