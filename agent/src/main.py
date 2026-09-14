"""
Elegant Solutions — Tracking Agent
Entry point. Orchestrates login, monitor loop, config sync, and tray icon.

Run as Administrator on Windows so the blocker can edit the hosts file.
"""
import logging
import sys
import threading
import time
from typing import Optional

import config
import api_client
import monitor
import blocker
import notifier
from auth_dialog import show_login_dialog, show_setup_wizard

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("main")

HEARTBEAT_INTERVAL = 10   # seconds
CONFIG_SYNC_INTERVAL = 60  # seconds


class AgentState:
    def __init__(self) -> None:
        self.cfg: dict = {}
        self.user_email: str = ""
        self.user_name: str = ""
        self.blacklist: list[str] = []
        self.session_ends_at: Optional[str] = None
        self.running: bool = False
        self._lock = threading.Lock()

    def set_user(self, email: str, name: str) -> None:
        with self._lock:
            self.user_email = email
            self.user_name = name

    def clear_user(self) -> None:
        with self._lock:
            self.user_email = ""
            self.user_name = ""

    def update_blacklist(self, patterns: list[str]) -> None:
        with self._lock:
            self.blacklist = patterns

    def get_blacklist(self) -> list[str]:
        with self._lock:
            return list(self.blacklist)


state = AgentState()


# ---------------------------------------------------------------------------
# Heartbeat loop
# ---------------------------------------------------------------------------

def heartbeat_loop() -> None:
    while state.running:
        try:
            app_name, window_title = monitor.get_active_window_info()
            bl = state.get_blacklist()
            risk = monitor.calculate_risk(app_name, window_title, bl)

            api_client.send_heartbeat(
                server_url=state.cfg["server_url"],
                api_key=state.cfg["api_key"],
                user_email=state.user_email,
                active_app=app_name,
                active_title=window_title,
                risk_level=risk,
            )
        except Exception as exc:
            logger.warning("Heartbeat error: %s", exc)

        time.sleep(HEARTBEAT_INTERVAL)


# ---------------------------------------------------------------------------
# Config sync loop
# ---------------------------------------------------------------------------

def config_sync_loop() -> None:
    while state.running:
        try:
            remote = api_client.fetch_config(
                server_url=state.cfg["server_url"],
                api_key=state.cfg["api_key"],
            )
            if remote:
                new_blacklist = remote.get("blacklist", [])
                if new_blacklist != state.blacklist:
                    state.update_blacklist(new_blacklist)
                    blocker.apply_blacklist(new_blacklist)
                    logger.info("Blacklist updated: %s", new_blacklist)

                new_ends_at = remote.get("sessionEndsAt")
                if new_ends_at != state.session_ends_at:
                    state.session_ends_at = new_ends_at
                    notifier.schedule_expiry_warnings(new_ends_at)

        except Exception as exc:
            logger.warning("Config sync error: %s", exc)

        time.sleep(CONFIG_SYNC_INTERVAL)


# ---------------------------------------------------------------------------
# System tray
# ---------------------------------------------------------------------------

def build_tray_icon() -> None:
    try:
        import pystray  # type: ignore
        from PIL import Image, ImageDraw  # type: ignore
    except ImportError:
        logger.warning("pystray / Pillow not available — running without tray icon")
        return

    def create_icon_image(color: str = "#0052FF") -> Image.Image:
        img = Image.new("RGB", (64, 64), color=color)
        draw = ImageDraw.Draw(img)
        draw.ellipse([8, 8, 56, 56], fill="white")
        draw.text((22, 18), "E", fill=color)
        return img

    def on_logout(icon, item):  # noqa: ARG001
        state.clear_user()
        notifier.notify_logout()
        icon.icon = create_icon_image("#94a3b8")
        icon.title = "Elegant Agent — ออกจากระบบแล้ว"
        show_login_ui()

    def on_quit(icon, item):  # noqa: ARG001
        state.running = False
        blocker.clear_blacklist()
        icon.stop()

    def show_status(icon, item):  # noqa: ARG001
        user_str = state.user_email or "(ยังไม่ได้ login)"
        import tkinter.messagebox as mb
        mb.showinfo(
            "Elegant Agent — สถานะ",
            f"เครื่อง: {state.cfg.get('machine_code', '—')}\n"
            f"ผู้ใช้: {user_str}\n"
            f"เซิร์ฟเวอร์: {state.cfg.get('server_url', '—')}",
        )

    menu = pystray.Menu(
        pystray.MenuItem("สถานะ", show_status),
        pystray.MenuItem("ออกจากระบบ", on_logout),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("ปิด Agent", on_quit),
    )

    icon = pystray.Icon(
        "ElegantAgent",
        create_icon_image(),
        "Elegant Agent",
        menu,
    )
    icon.run()


# ---------------------------------------------------------------------------
# Login flow (called from main thread and tray logout)
# ---------------------------------------------------------------------------

def show_login_ui() -> bool:
    user = show_login_dialog(state.cfg["server_url"])
    if not user:
        return False
    state.set_user(user.get("email", ""), user.get("name", ""))
    notifier.notify_login(user.get("name", ""))
    logger.info("User logged in: %s", user.get("email"))
    return True


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    logger.info("Elegant Solutions Agent starting...")

    cfg = config.load()

    # First-run setup if not configured
    if not config.is_configured(cfg):
        logger.info("No configuration found — running setup wizard")
        updated = show_setup_wizard(cfg)
        if not updated:
            logger.info("Setup cancelled — exiting")
            sys.exit(0)
        config.save(updated)
        cfg = updated
        logger.info("Configuration saved for machine: %s", cfg["machine_code"])

    state.cfg = cfg
    state.running = True

    # Login
    if not show_login_ui():
        logger.info("Login cancelled — exiting")
        sys.exit(0)

    # Initial config sync
    remote = api_client.fetch_config(cfg["server_url"], cfg["api_key"])
    if remote:
        state.update_blacklist(remote.get("blacklist", []))
        blocker.apply_blacklist(state.blacklist)
        state.session_ends_at = remote.get("sessionEndsAt")
        notifier.schedule_expiry_warnings(state.session_ends_at)

    # Background threads
    heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
    heartbeat_thread.start()

    config_thread = threading.Thread(target=config_sync_loop, daemon=True)
    config_thread.start()

    logger.info("Agent running — machine: %s", cfg["machine_code"])

    # Tray icon runs the main loop (blocking)
    build_tray_icon()

    # Cleanup when tray exits
    state.running = False
    blocker.clear_blacklist()
    logger.info("Agent stopped")


if __name__ == "__main__":
    main()
