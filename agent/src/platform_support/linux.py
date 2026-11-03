"""Linux active-window support for X11, with explicit Wayland degradation."""
import logging

import psutil

from logging_setup import safe_exception
from . import ActiveWindowInfo, detect_session_type

logger = logging.getLogger(__name__)

try:
    from Xlib import X, display

    _XLIB_AVAILABLE = True
except ImportError:
    _XLIB_AVAILABLE = False
    display = None  # type: ignore[assignment]
    X = None  # type: ignore[assignment]


def capability_status() -> str:
    session = detect_session_type()
    if session == "wayland":
        return "wayland-title-unavailable"
    if session != "x11":
        return f"{session}-title-unavailable"
    if not _XLIB_AVAILABLE:
        return "x11-python-xlib-unavailable"
    return "x11-ewmh"


def get_active_window() -> ActiveWindowInfo:
    session = detect_session_type()
    if session == "wayland":
        return ActiveWindowInfo(
            reason="Wayland does not expose a generic active-window title API"
        )
    if session != "x11":
        return ActiveWindowInfo(reason="Linux graphical session is unavailable")
    if not _XLIB_AVAILABLE:
        return ActiveWindowInfo(reason="python-xlib is not installed")

    connection = None
    try:
        connection = display.Display()
        root = connection.screen().root
        active_atom = connection.intern_atom("_NET_ACTIVE_WINDOW")
        active_property = root.get_full_property(active_atom, X.AnyPropertyType)
        if not active_property or not active_property.value:
            return ActiveWindowInfo(reason="X11 did not report an active window")

        window_id = _first_int(active_property.value)
        if window_id is None:
            return ActiveWindowInfo(reason="X11 active-window property was invalid")

        window = connection.create_resource_object("window", window_id)
        pid = _read_pid(connection, window)
        title = _read_title(connection, window)
        app_name = ""
        if pid is not None:
            try:
                app_name = psutil.Process(pid).name()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        return ActiveWindowInfo(
            app_name=app_name,
            window_title=title,
            pid=pid,
            available=True,
            reason="X11 window title unavailable" if not title else "",
        )
    except Exception as exc:
        logger.warning("X11 active-window tracking failed: %s", safe_exception(exc))
        return ActiveWindowInfo(reason="X11 active-window query failed")
    finally:
        if connection is not None:
            connection.close()


def _first_int(value) -> int | None:
    if not isinstance(value, (str, bytes, int, float)):
        try:
            value = value[0]
        except (IndexError, KeyError, TypeError):
            pass
    item = value
    try:
        return int(item)
    except (TypeError, ValueError):
        return None


def _read_pid(connection, window) -> int | None:
    atom = connection.intern_atom("_NET_WM_PID")
    prop = window.get_full_property(atom, X.AnyPropertyType)
    if not prop or not prop.value:
        return None
    return _first_int(prop.value)


def _read_title(connection, window) -> str:
    for atom_name in ("_NET_WM_NAME", "WM_NAME"):
        prop = window.get_full_property(
            connection.intern_atom(atom_name), X.AnyPropertyType
        )
        if prop and prop.value:
            text = _property_text(prop.value)
            if text:
                return text
    return ""


def _property_text(value) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace").strip()
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (list, tuple)):
        try:
            return bytes(value).decode("utf-8", errors="replace").strip()
        except (TypeError, ValueError):
            return "".join(str(item) for item in value).strip()
    return str(value).strip()
