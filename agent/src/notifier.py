"""
Windows toast notifications for session expiry warnings.
Uses plyer for cross-platform notification support.
"""
import logging
import threading
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_APP_NAME = "Elegant Solutions"
_scheduled: dict[str, threading.Timer] = {}


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
        logger.warning("macOS notification failed: %s", exc)


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
        logger.warning("Notification failed: %s", exc)


def _cancel_all() -> None:
    for key, timer in list(_scheduled.items()):
        timer.cancel()
    _scheduled.clear()


def schedule_expiry_warnings(session_ends_at_iso: Optional[str]) -> None:
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

    warnings = [
        (remaining - 10 * 60, "เหลือเวลาอีก 10 นาที", "เซสชั่นของคุณจะหมดอายุในอีก 10 นาที กรุณาบันทึกงานของคุณ"),
        (remaining - 2 * 60, "เหลือเวลาอีก 2 นาที", "เซสชั่นของคุณกำลังจะสิ้นสุด กรุณาออกจากระบบ"),
        (remaining, "หมดเวลาใช้งาน", "เซสชั่นของคุณหมดอายุแล้ว กรุณาออกจากห้อง"),
    ]

    for delay, title, msg in warnings:
        if delay > 0:
            key = f"{title}-{delay:.0f}"
            timer = threading.Timer(delay, _send, args=(title, msg))
            timer.daemon = True
            timer.start()
            _scheduled[key] = timer
            logger.debug("Scheduled notification '%s' in %.0fs", title, delay)


def notify_login(user_name: str) -> None:
    _send("เข้าสู่ระบบสำเร็จ", f"ยินดีต้อนรับ {user_name}")


def notify_logout() -> None:
    _cancel_all()
    _send("ออกจากระบบ", "ออกจากระบบเรียบร้อยแล้ว")


def notify_blocked(domain: str) -> None:
    _send("บล็อกเว็บไซต์", f"เว็บไซต์ {domain} ถูกบล็อกโดยระบบ")


def notify_offline() -> None:
    _send("ไม่สามารถเชื่อมต่อได้", "Agent ไม่สามารถส่งข้อมูลไปยังเซิร์ฟเวอร์ได้")
