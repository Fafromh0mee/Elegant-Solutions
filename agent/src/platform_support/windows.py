"""Existing Windows foreground-window implementation."""
import logging

import psutil

from logging_setup import safe_exception
from . import ActiveWindowInfo

logger = logging.getLogger(__name__)

try:
    import win32gui
    import win32process

    _WIN32_AVAILABLE = True
except ImportError:
    _WIN32_AVAILABLE = False
    logger.warning("pywin32 not available — window-title tracking disabled")


def capability_status() -> str:
    return "windows-pywin32" if _WIN32_AVAILABLE else "windows-process-fallback"


def get_active_window() -> ActiveWindowInfo:
    """Preserve the prior pywin32 behavior on Windows."""
    if not _WIN32_AVAILABLE:
        return _fallback_top_process()

    try:
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return ActiveWindowInfo(available=True, reason="no foreground window")

        title = win32gui.GetWindowText(hwnd)
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        try:
            proc = psutil.Process(pid)
            app_name = proc.name().replace(".exe", "")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            app_name = ""

        return ActiveWindowInfo(
            app_name=app_name,
            window_title=title,
            pid=pid,
            available=True,
        )
    except Exception as exc:
        logger.warning("Active-window tracking failed: %s", safe_exception(exc))
        return ActiveWindowInfo(
            available=True,
            reason="Windows foreground-window query failed",
        )


def _fallback_top_process() -> ActiveWindowInfo:
    """Retain the existing Windows-only fallback when pywin32 is unavailable."""
    try:
        procs = [
            p for p in psutil.process_iter(["name", "cpu_percent"])
            if p.info["cpu_percent"] and p.info["cpu_percent"] > 0
        ]
        if not procs:
            return ActiveWindowInfo(available=True, reason="no active process")
        top = max(procs, key=lambda p: p.info["cpu_percent"])
        return ActiveWindowInfo(
            app_name=top.info["name"].replace(".exe", ""),
            pid=top.pid,
            available=True,
            reason="pywin32 unavailable",
        )
    except Exception as exc:
        logger.warning("Process tracking failed: %s", safe_exception(exc))
        return ActiveWindowInfo(available=True, reason="Windows process fallback failed")
