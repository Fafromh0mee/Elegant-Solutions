"""
Windows toast notifications for session expiry warnings.
Uses plyer for cross-platform notification support.
"""
import logging
import platform
import threading
from datetime import datetime, timezone
from typing import Optional

from logging_setup import safe_exception

logger = logging.getLogger(__name__)

_APP_NAME = "Elegant Solutions"
_scheduled: dict[str, threading.Timer] = {}


def log_platform_status() -> None:
    """Log notification backend availability without making it a hard dependency."""
    if platform.system() != "Linux":
        return
    try:
        from plyer import notification  # type: ignore  # noqa: F401
    except ImportError:
        logger.warning("Linux notifications unavailable: plyer is not installed")
    else:
        logger.info("Linux notification backend available via plyer; runtime failures are non-fatal")


def _send(title: str, message: str) -> None:
    import platform
    if platform.system() == "Darwin":
        _send_macos(title, message)
    else:
        _send_plyer(title, message)


def _send_macos(title: str, message: str) -> None:
    """Use osascript for macOS notifications — no extra dependencies needed."""
    import subprocess
    try:
        script = f'display notification "{message}" with title "{title}" subtitle "{_APP_NAME}"'
        subprocess.run(["osascript", "-e", script], check=True, capture_output=True)
    except Exception as exc:
        logger.warning("macOS notification failed: %s", safe_exception(exc))


def _send_plyer(title: str, message: str) -> None:
    try:
        from plyer import notification  # type: ignore
        notification.notify(
            app_name=_APP_NAME,
            title=title,
            message=message,
            timeout=10,
        )
    except Exception as exc:
        logger.warning("Notification failed: %s", safe_exception(exc))


def _cancel_all() -> None:
    for key, timer in list(_scheduled.items()):
        timer.cancel()
    _scheduled.clear()


def expiry_warning_delay(session_ends_at_iso: Optional[str], now: Optional[datetime] = None) -> Optional[float]:
    """Return seconds until the 15-minute warning, or None for an expired session."""
    if not session_ends_at_iso:
        return None
    try:
        ends_at = datetime.fromisoformat(session_ends_at_iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    current = now or datetime.now(tz=timezone.utc)
    remaining = (ends_at - current).total_seconds()
    return max(0.0, remaining - 15 * 60) if remaining > 0 else None


def schedule_expiry_warnings(session_ends_at_iso: Optional[str], on_expire=None) -> None:
    """
    Schedule Windows notifications before the session expires.
    Call with None to cancel existing scheduled notifications.
    """
    _cancel_all()

    if not session_ends_at_iso:
        return

    try:
        ends_at = datetime.fromisoformat(session_ends_at_iso.replace("Z", "+00:00"))
    except ValueError:
        logger.warning("Invalid sessionEndsAt: %s", session_ends_at_iso)
        return

    now = datetime.now(tz=timezone.utc)
    remaining = (ends_at - now).total_seconds()

    warning_delay = expiry_warning_delay(session_ends_at_iso, now)
    if warning_delay is None:
        return
    warning_title = "เหลือเวลาใช้งานอีก 15 นาที"
    warning_message = "เหลือเวลาใช้งานอีก 15 นาที กรุณาบันทึกงานของคุณ ระบบ Elegant Agent จะออกจากระบบโดยอัตโนมัติเมื่อสิทธิ์การใช้งานสิ้นสุด"
    warnings = [(warning_delay, warning_title, warning_message)]

    for delay, title, msg in warnings:
        if delay >= 0:
            key = f"{title}-{delay:.0f}"
            timer = threading.Timer(delay, _send, args=(title, msg))
            timer.daemon = True
            timer.start()
            _scheduled[key] = timer
            logger.debug("Scheduled notification '%s' in %.0fs", title, delay)

    if remaining > 0:
        expiry_timer = threading.Timer(remaining, on_expire or (lambda: None))
        expiry_timer.daemon = True
        expiry_timer.start()
        _scheduled["expiry"] = expiry_timer


def notify_login(user_name: str) -> None:
    _send("เข้าสู่ระบบสำเร็จ", f"ยินดีต้อนรับ {user_name}")


def notify_logout() -> None:
    _cancel_all()
    _send("ออกจากระบบ", "ออกจากระบบเรียบร้อยแล้ว")


def notify_auto_logout() -> None:
    _cancel_all()
    _send("สิทธิ์การใช้งานสิ้นสุด", "ระบบ Elegant Agent ออกจากระบบแล้ว กรุณาบันทึกงานและเข้าสู่ระบบเมื่อมีสิทธิ์ใช้งาน")


def notify_blocked(domain: str) -> None:
    _send("บล็อกเว็บไซต์", f"เว็บไซต์ {domain} ถูกบล็อกโดยระบบ")


def notify_offline() -> None:
    _send("ไม่สามารถเชื่อมต่อได้", "Agent ไม่สามารถส่งข้อมูลไปยังเซิร์ฟเวอร์ได้")
