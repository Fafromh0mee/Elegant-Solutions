"""Cross-platform process/window monitoring and risk classification."""
import logging
import re
from typing import Optional

from logging_setup import safe_exception
from platform_support import ActiveWindowInfo, environment_description, get_active_window

logger = logging.getLogger(__name__)

def get_active_window_snapshot() -> ActiveWindowInfo:
    """Return the platform provider's active-window result."""
    return get_active_window()


def get_active_window_info() -> tuple[str, str]:
    """Preserve the existing tuple interface used by risk classification."""
    snapshot = get_active_window_snapshot()
    return snapshot.app_name, snapshot.window_title


def log_capability_status() -> None:
    """Log OS/session/capability state once at Agent startup."""
    details = environment_description()
    logger.info(
        "Operating system: %s; desktop session: %s; active-window capability: %s",
        details["os"],
        details["session"],
        details["active_window"],
    )
    if details["active_window"] not in {"windows-pywin32", "x11-ewmh"}:
        logger.warning(
            "Active-window title tracking unavailable or degraded: %s",
            details["active_window"],
        )


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
