"""Elegant Solutions Tracking Agent entry point and lifecycle coordinator."""
import logging
import platform
import signal
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Optional

import logging_setup

logging_setup.configure_logging()

import api_client
import blocker
import config
import monitor
import notifier
from auth_dialog import show_activation_dialog, show_login_dialog, show_maintenance_dialog, show_setup_wizard
from logging_setup import safe_exception
from version import AGENT_VERSION

logger = logging.getLogger("main")

HEARTBEAT_INTERVAL = 10
CONFIG_SYNC_INTERVAL = 60


class AgentState:
    def __init__(self) -> None:
        self.cfg: dict = {}
        self.user_email = ""
        self.user_name = ""
        self.session_token = ""
        self.session_ends_at: Optional[str] = None
        self.room_code = ""
        self.blacklist: list[str] = []
        self.running = False
        self._lock = threading.Lock()
        self._session_transition_lock = threading.Lock()

    def set_session(self, response: dict) -> None:
        user = response.get("user", {})
        room = response.get("room", {})
        with self._lock:
            self.user_email = user.get("email", "")
            self.user_name = user.get("name", "")
            self.session_token = response.get("sessionToken", "")
            self.session_ends_at = response.get("expiresAt")
            self.room_code = room.get("roomCode", "")

    def clear_user(self) -> None:
        with self._lock:
            self.user_email = ""
            self.user_name = ""
            self.session_token = ""
            self.session_ends_at = None
            self.room_code = self.cfg.get("room_code", "")

    def get_session_token(self) -> str:
        with self._lock:
            return self.session_token

    def get_session_ends_at(self) -> Optional[str]:
        with self._lock:
            return self.session_ends_at

    def get_user_display(self) -> str:
        with self._lock:
            return self.user_name or self.user_email or "(ยังไม่ได้ login)"

    def update_blacklist(self, patterns: list[str]) -> None:
        with self._lock:
            self.blacklist = list(patterns)

    def get_blacklist(self) -> list[str]:
        with self._lock:
            return list(self.blacklist)


state = AgentState()


def _parse_expiry(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def show_login_ui() -> bool:
    user = show_login_dialog(state.cfg["server_url"], state.cfg["api_key"])
    if not user or "sessionToken" not in user:
        return False
    state.set_session(user)
    notifier.notify_login(user.get("user", {}).get("name", ""))
    notifier.schedule_expiry_warnings(state.get_session_ends_at(), on_expire=handle_session_expiry)
    logger.info("User login completed")
    return True


def handle_session_expiry() -> None:
    """Refresh at the known entitlement boundary, or clear only the Agent user session."""
    with state._session_transition_lock:
        token = state.get_session_token()
        if not token or not state.running:
            return
        refreshed = api_client.refresh_session(state.cfg["server_url"], state.cfg["api_key"], token)
        if refreshed and not refreshed.get("expired") and "sessionToken" in refreshed:
            state.set_session(refreshed)
            notifier.schedule_expiry_warnings(state.get_session_ends_at(), on_expire=handle_session_expiry)
            logger.info("Agent session extended")
            return

        state.clear_user()
        notifier.notify_auto_logout()
        logger.info("Agent user session cleared after entitlement expiry")
        # Tk dialogs are kept out of the timer callback's stack and the Agent remains alive.
        threading.Thread(target=show_login_ui, name="agent-login-after-expiry", daemon=True).start()


def manual_logout() -> None:
    with state._session_transition_lock:
        token = state.get_session_token()
        if token:
            api_client.logout_session(state.cfg["server_url"], state.cfg["api_key"], token)
        state.clear_user()
        notifier.notify_logout()
        logger.info("Manual Agent logout completed")
        threading.Thread(target=show_login_ui, name="agent-login-after-manual-logout", daemon=True).start()


def heartbeat_loop() -> None:
    while state.running:
        try:
            session_token = state.get_session_token()
            snapshot = monitor.get_active_window_snapshot() if session_token else None
            app_name = snapshot.app_name if snapshot and snapshot.available else None
            window_title = snapshot.window_title if snapshot and snapshot.available else None
            risk_level = (
                monitor.calculate_risk(app_name or "", window_title or "", state.get_blacklist())
                if session_token
                else "NORMAL"
            )
            result = api_client.send_heartbeat(
                server_url=state.cfg["server_url"],
                api_key=state.cfg["api_key"],
                session_token=session_token,
                active_app=app_name,
                active_title=window_title,
                risk_level=risk_level,
                agent_version=AGENT_VERSION,
            )
            if result.get("sessionInvalid"):
                handle_session_expiry()
        except Exception as exc:
            logger.warning("Heartbeat/tracking loop error: %s", safe_exception(exc))
        time.sleep(HEARTBEAT_INTERVAL)


def config_sync_loop() -> None:
    while state.running:
        try:
            remote = api_client.fetch_config(state.cfg["server_url"], state.cfg["api_key"])
            if remote:
                new_blacklist = remote.get("blacklist", [])
                if new_blacklist != state.get_blacklist():
                    state.update_blacklist(new_blacklist)
                    blocker.apply_blacklist(new_blacklist)
                    logger.info("Blacklist updated: %s", new_blacklist)
        except Exception as exc:
            logger.warning("Configuration sync loop error: %s", safe_exception(exc))
        time.sleep(CONFIG_SYNC_INTERVAL)


def build_tray_icon() -> None:
    try:
        import pystray  # type: ignore
        from PIL import Image, ImageDraw  # type: ignore
    except ImportError:
        logger.warning("pystray / Pillow not available — running without tray icon")
        if platform.system() == "Linux":
            _run_without_tray()
        return

    def create_icon_image(color: str = "#0052FF") -> Image.Image:
        img = Image.new("RGB", (64, 64), color=color)
        draw = ImageDraw.Draw(img)
        draw.ellipse([8, 8, 56, 56], fill="white")
        draw.text((22, 18), "E", fill=color)
        return img

    def on_logout(icon, item):  # noqa: ARG001
        manual_logout()
        icon.icon = create_icon_image("#94a3b8")
        icon.title = "Elegant Agent — ออกจากระบบแล้ว"

    def show_status(icon, item):  # noqa: ARG001
        import tkinter.messagebox as mb
        expiry = _parse_expiry(state.get_session_ends_at())
        remaining = "—"
        if expiry:
            remaining = f"{max(0, int((expiry - datetime.now(timezone.utc)).total_seconds() // 60))} นาที"
        mb.showinfo(
            "Elegant Agent — สถานะ",
            "Elegant Solution Agent\n"
            f"● {'Connected' if state.get_session_token() else 'Ready'}\n"
            f"เครื่อง: {state.cfg.get('machine_code', '—')}\n"
            f"ห้อง: {state.room_code or state.cfg.get('room_code', '—')}\n"
            f"ผู้ใช้: {state.get_user_display()}\n"
            f"Access until: {expiry.astimezone().strftime('%H:%M') if expiry else '—'}\n"
            f"{remaining} remaining",
        )

    def on_maintenance(icon, item):  # noqa: ARG001
        show_maintenance_dialog(state.cfg["server_url"], state.cfg["api_key"])

    menu = pystray.Menu(
        pystray.MenuItem("สถานะ", show_status),
        pystray.MenuItem("เข้าสู่ระบบ", lambda icon, item: show_login_ui()),
        pystray.MenuItem("ออกจากระบบ", on_logout),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Administrator Maintenance", on_maintenance),
    )
    icon = pystray.Icon("ElegantAgent", create_icon_image(), "Elegant Agent", menu)
    try:
        icon.run()
    except Exception as exc:
        if platform.system() != "Linux":
            raise
        logger.warning("Tray unavailable; continuing without tray: %s", safe_exception(exc))
        _run_without_tray()


def _run_without_tray() -> None:
    logger.warning("Agent is running without tray support")
    try:
        while state.running:
            time.sleep(1)
    except KeyboardInterrupt:
        state.running = False


def _run() -> None:
    monitor.log_capability_status()
    blocker.log_platform_status()
    notifier.log_platform_status()
    cfg = config.load()

    if not config.is_configured(cfg):
        deployment_url = config.deployment_server_url()
        if deployment_url:
            logger.info("No configuration found — running activation flow")
            activation = show_activation_dialog(deployment_url)
            if not activation:
                logger.info("Activation cancelled — exiting")
                sys.exit(0)
            updated = {
                "server_url": deployment_url,
                "machine_code": activation["machineCode"],
                "room_code": activation.get("roomCode", ""),
                "api_key": activation["apiKey"],
            }
        else:
            logger.info("No deployment URL found — using legacy developer registration wizard")
            updated = show_setup_wizard(cfg)
        if not updated:
            logger.info("Setup cancelled — exiting")
            sys.exit(0)
        config.save(updated)
        cfg = updated

    state.cfg = cfg
    state.room_code = cfg.get("room_code", "")
    state.running = True
    remote = api_client.fetch_config(cfg["server_url"], cfg["api_key"])
    if remote:
        state.update_blacklist(remote.get("blacklist", []))
        blocker.apply_blacklist(state.get_blacklist())

    threading.Thread(target=heartbeat_loop, name="agent-heartbeat", daemon=True).start()
    threading.Thread(target=config_sync_loop, name="agent-config", daemon=True).start()
    show_login_ui()
    logger.info("Agent running — machine: %s", cfg["machine_code"])
    build_tray_icon()


def main() -> None:
    log_path = logging_setup.configure_logging()
    logger.info("Elegant Solutions Agent starting; log file: %s", log_path or "unavailable")
    signal.signal(signal.SIGINT, _handle_shutdown_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _handle_shutdown_signal)
    try:
        _run()
    except SystemExit:
        raise
    except Exception as exc:
        logger.error("Agent terminated unexpectedly: %s", safe_exception(exc))
        raise
    finally:
        state.running = False
        blocker.clear_blacklist()
        logger.info("Elegant Solutions Agent stopped")


def _handle_shutdown_signal(signum, _frame) -> None:
    logger.info("Shutdown signal received: %s", signum)
    state.running = False


if __name__ == "__main__":
    main()
