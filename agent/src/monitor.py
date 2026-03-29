"""
Process and window-title monitor (Windows-only).
Uses psutil for process enumeration and win32gui for the active window title.
Falls back gracefully on non-Windows platforms for development.
"""
import logging
import platform
import re
from typing import Optional

import psutil

logger = logging.getLogger(__name__)

_IS_WINDOWS = platform.system() == "Windows"

if _IS_WINDOWS:
    try:
        import win32gui
        import win32process
        _WIN32_AVAILABLE = True
    except ImportError:
        _WIN32_AVAILABLE = False
        logger.warning("pywin32 not available — window-title tracking disabled")
else:
    _WIN32_AVAILABLE = False


def get_active_window_info() -> tuple[str, str]:
    """
    Return (app_name, window_title) for the currently focused window.
    Both values are empty strings when unavailable.
    """
    if not _WIN32_AVAILABLE:
        return _fallback_top_process()

    try:
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return "", ""

        title = win32gui.GetWindowText(hwnd)

        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        try:
            proc = psutil.Process(pid)
            app_name = proc.name().replace(".exe", "")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            app_name = ""

        return app_name, title
    except Exception as exc:
        logger.debug("get_active_window_info error: %s", exc)
        return "", ""


def _fallback_top_process() -> tuple[str, str]:
    """Return the name of the process using the most CPU (dev fallback)."""
    try:
        procs = [
            p for p in psutil.process_iter(["name", "cpu_percent"])
            if p.info["cpu_percent"] and p.info["cpu_percent"] > 0
        ]
        if not procs:
            return "", ""
        top = max(procs, key=lambda p: p.info["cpu_percent"])
        return top.info["name"].replace(".exe", ""), ""
    except Exception:
        return "", ""


# --- Risk calculation ---

_KNOWN_BROWSERS = {"chrome", "msedge", "firefox", "opera", "brave"}

_HIGH_RISK_KEYWORDS = [
    r"youtube",
    r"tiktok",
    r"facebook",
    r"twitter",
    r"x\.com",
    r"instagram",
    r"netflix",
    r"twitch",
    r"roblox",
    r"steam",
    r"discord",
]
_HIGH_RISK_RE = re.compile("|".join(_HIGH_RISK_KEYWORDS), re.IGNORECASE)


def calculate_risk(
    app_name: str,
    window_title: str,
    blacklist: list[str],
) -> str:
    """
    Return "WATCH" if the active window matches the blacklist or known
    high-risk patterns, otherwise "NORMAL".
    """
    combined = f"{app_name} {window_title}".lower()

    for pattern in blacklist:
        if pattern.lower() in combined:
            return "WATCH"

    if _HIGH_RISK_RE.search(combined):
        return "WATCH"

    return "NORMAL"


def extract_domain_from_title(title: str) -> Optional[str]:
    """
    Try to extract a domain hint from a browser window title.
    Chrome format: "<Page Title> - Google Chrome"
    Edge format:   "<Page Title> - Microsoft Edge"
    Returns None when unable to parse.
    """
    for suffix in [
        " - Google Chrome",
        " - Microsoft Edge",
        " - Mozilla Firefox",
        " - Opera",
        " - Brave",
    ]:
        if title.endswith(suffix):
            page_title = title[: -len(suffix)]
            return page_title
    return None
