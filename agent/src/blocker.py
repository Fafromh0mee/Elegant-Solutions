"""
Website blocker via Windows hosts file.
Requires the agent to be running with Administrator privileges.

Managed entries are bracketed by:
  # --- ElegantAgent START ---
  # --- ElegantAgent END ---
so they can be cleanly added / removed without touching unrelated entries.
"""
import logging
import platform
from pathlib import Path

logger = logging.getLogger(__name__)

_IS_WINDOWS = platform.system() == "Windows"
_HOSTS_PATH = (
    Path(r"C:\Windows\System32\drivers\etc\hosts")
    if _IS_WINDOWS
    else Path("/etc/hosts")
)

_MARKER_START = "# --- ElegantAgent START ---"
_MARKER_END = "# --- ElegantAgent END ---"


def _read_hosts() -> str:
    try:
        return _HOSTS_PATH.read_text(encoding="utf-8")
    except Exception as exc:
        logger.error("Cannot read hosts file: %s", exc)
        return ""


def _write_hosts(content: str) -> bool:
    try:
        _HOSTS_PATH.write_text(content, encoding="utf-8")
        return True
    except PermissionError:
        logger.error(
            "Permission denied writing hosts file — run agent as Administrator"
        )
        return False
    except Exception as exc:
        logger.error("Cannot write hosts file: %s", exc)
        return False


def _strip_managed_block(content: str) -> str:
    """Remove the block between the ElegantAgent markers."""
    lines = content.splitlines(keepends=True)
    result = []
    inside = False
    for line in lines:
        if _MARKER_START in line:
            inside = True
            continue
        if _MARKER_END in line:
            inside = False
            continue
        if not inside:
            result.append(line)
    return "".join(result)


def apply_blacklist(patterns: list[str]) -> bool:
    """
    Sync the hosts file with the given list of patterns.
    Clears previous ElegantAgent entries and writes fresh ones.
    Returns True if the file was updated successfully.
    """
    content = _read_hosts()
    if content is None:
        return False

    base = _strip_managed_block(content)
    if not base.endswith("\n"):
        base += "\n"

    if not patterns:
        return _write_hosts(base)

    block_lines = [_MARKER_START + "\n"]
    for pattern in patterns:
        domain = pattern.strip().lower().lstrip("*.")
        if domain:
            block_lines.append(f"127.0.0.1 {domain}\n")
            block_lines.append(f"127.0.0.1 www.{domain}\n")
    block_lines.append(_MARKER_END + "\n")

    new_content = base + "".join(block_lines)
    ok = _write_hosts(new_content)
    if ok:
        logger.info("Hosts file updated with %d blocked domains", len(patterns))
    return ok


def clear_blacklist() -> bool:
    """Remove all ElegantAgent-managed entries from the hosts file."""
    content = _read_hosts()
    cleaned = _strip_managed_block(content)
    return _write_hosts(cleaned)


def get_current_blocked() -> list[str]:
    """Return list of domains currently blocked by ElegantAgent."""
    content = _read_hosts()
    lines = content.splitlines()
    inside = False
    domains: list[str] = []
    for line in lines:
        if _MARKER_START in line:
            inside = True
            continue
        if _MARKER_END in line:
            break
        if inside and line.startswith("127.0.0.1"):
            parts = line.split()
            if len(parts) >= 2:
                domains.append(parts[1])
    return domains
