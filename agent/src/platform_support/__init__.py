"""Platform-specific Agent capabilities with a small shared interface."""
from dataclasses import dataclass
import os
import platform as _platform
from typing import Optional


@dataclass(frozen=True)
class ActiveWindowInfo:
    """The currently focused window, when the desktop exposes it safely."""

    app_name: str = ""
    window_title: str = ""
    pid: Optional[int] = None
    available: bool = False
    reason: str = ""


def detect_session_type() -> str:
    """Return x11, wayland, or unknown for the current graphical session."""
    session = os.environ.get("XDG_SESSION_TYPE", "").strip().lower()
    if session in {"x11", "wayland"}:
        return session
    if os.environ.get("WAYLAND_DISPLAY"):
        return "wayland"
    if os.environ.get("DISPLAY"):
        return "x11"
    return "unknown"


_SYSTEM = _platform.system()

if _SYSTEM == "Windows":
    from .windows import capability_status, get_active_window  # noqa: F401
elif _SYSTEM == "Linux":
    from .linux import capability_status, get_active_window  # noqa: F401
elif _SYSTEM == "Darwin":
    from .macos import capability_status, get_active_window  # noqa: F401
else:
    def capability_status() -> str:
        return "unsupported-platform"

    def get_active_window() -> ActiveWindowInfo:
        return ActiveWindowInfo(reason=f"unsupported operating system: {_SYSTEM}")


def environment_description() -> dict[str, str]:
    """Return non-sensitive environment details suitable for startup logging."""
    return {
        "os": _SYSTEM,
        "session": detect_session_type() if _SYSTEM == "Linux" else "native",
        "active_window": capability_status(),
    }
