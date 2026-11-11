"""Machine-owned Agent runtime. No GUI or desktop API is used here.

The loopback bridge is a pilot-local capability for interactive users. The
machine API key and Agent session token never leave this process.
"""
import hmac
import json
import logging
import os
import platform
import secrets
import signal
import socket
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

import api_client
import config
import logging_setup
import monitor
from version import AGENT_VERSION

logger = logging.getLogger("machine_service")
BRIDGE_HOST = config.BRIDGE_HOST
BRIDGE_PORT = config.BRIDGE_PORT
HEARTBEAT_SECONDS = 10
CONFIG_SECONDS = 60
ACTIVITY_MAX_AGE_SECONDS = 25


def parse_expiry(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


class MachineRuntime:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.cfg = config.load()
        self.bridge_token = secrets.token_urlsafe(48)
        self.session_token = ""
        self.session_ends_at: Optional[str] = None
        self.user: Optional[dict] = None
        self.blacklist: list[str] = []
        self.activity: Optional[tuple[Optional[str], Optional[str], float]] = None
        self.last_heartbeat_ok = 0.0
        self.stop_event = threading.Event()

    def publish_bridge_token(self) -> None:
        path = config.bridge_token_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.bridge_token, encoding="ascii")
        if platform.system() != "Windows":
            os.chmod(path.parent, 0o755)
            os.chmod(path, 0o644)

    def status(self) -> dict:
        with self.lock:
            return {
                "activated": config.is_configured(self.cfg),
                "machineCode": self.cfg.get("machine_code") or None,
                "roomCode": self.cfg.get("room_code") or None,
                "user": self.user,
                "sessionExpiresAt": self.session_ends_at,
                "online": bool(self.last_heartbeat_ok and time.monotonic() - self.last_heartbeat_ok < 30),
            }

    def activate(self, code: str) -> dict:
        if not isinstance(code, str) or len(code) != 6 or not code.isdigit():
            return {"error": "Activation Code ต้องเป็นตัวเลข 6 หลัก"}
        with self.lock:
            if config.is_configured(self.cfg):
                return {"error": "เครื่องนี้เปิดใช้งานแล้ว"}
            server_url = config.deployment_server_url()
            if not server_url:
                return {"error": "ไม่พบ deployment.json"}
            result = api_client.activate_machine(server_url, code, socket.gethostname(), platform.system())
            if not result or "error" in result:
                return {"error": (result or {}).get("error", "เปิดใช้งานไม่สำเร็จ")}
            self.cfg = {
                "server_url": server_url,
                "machine_code": result["machineCode"],
                "room_code": result["roomCode"],
                "api_key": result["apiKey"],
            }
            config.save(self.cfg)
            if platform.system() != "Windows":
                os.chmod(config._config_path(), 0o600)
            logger.info("Machine activated: %s", result["machineCode"])
            return {"ok": True, "machineCode": result["machineCode"], "roomCode": result["roomCode"]}

    def login(self, email: str, password: str) -> dict:
        with self.lock:
            if not config.is_configured(self.cfg):
                return {"error": "กรุณาเปิดใช้งานเครื่องก่อน"}
            result = api_client.verify_user(self.cfg["server_url"], self.cfg["api_key"], email, password)
            if not result or "error" in result or not result.get("sessionToken"):
                return {"error": (result or {}).get("error", "เข้าสู่ระบบไม่สำเร็จ")}
            self.session_token = result["sessionToken"]
            self.session_ends_at = result.get("expiresAt")
            self.user = result.get("user")
            self.activity = None
            logger.info("Agent user session started")
            return {"ok": True, "user": self.user, "sessionExpiresAt": self.session_ends_at}

    def logout(self) -> dict:
        with self.lock:
            if self.session_token and config.is_configured(self.cfg):
                api_client.logout_session(self.cfg["server_url"], self.cfg["api_key"], self.session_token)
            self._clear_user()
            logger.info("Agent user session ended")
            return {"ok": True}

    def _clear_user(self) -> None:
        self.session_token = ""
        self.session_ends_at = None
        self.user = None
        self.activity = None

    def submit_activity(self, app: Optional[str], title: Optional[str]) -> dict:
        with self.lock:
            if not self.session_token:
                return {"error": "ไม่มี Agent user session"}
            self.activity = (app[:255] if app else None, title[:512] if title else None, time.monotonic())
            return {"ok": True}

    def _refresh_due_session(self) -> None:
        expiry = parse_expiry(self.session_ends_at)
        if not self.session_token or not expiry or datetime.now(timezone.utc) < expiry:
            return
        result = api_client.refresh_session(self.cfg["server_url"], self.cfg["api_key"], self.session_token)
        if result and result.get("sessionToken") and not result.get("expired"):
            self.session_ends_at = result.get("expiresAt")
            return
        self._clear_user()
        logger.info("Agent user session expired")

    def heartbeat_loop(self) -> None:
        next_config = 0.0
        while not self.stop_event.is_set():
            with self.lock:
                if config.is_configured(self.cfg):
                    self._refresh_due_session()
                    if self.session_token and self.activity and time.monotonic() - self.activity[2] > ACTIVITY_MAX_AGE_SECONDS:
                        self.logout()
                    if time.monotonic() >= next_config:
                        remote = api_client.fetch_config(self.cfg["server_url"], self.cfg["api_key"])
                        if remote is not None:
                            self.blacklist = remote.get("blacklist", [])
                        next_config = time.monotonic() + CONFIG_SECONDS
                    app = title = None
                    risk = "NORMAL"
                    if self.session_token and self.activity:
                        app, title, _ = self.activity
                        risk = monitor.calculate_risk(app or "", title or "", self.blacklist)
                    response = api_client.send_heartbeat(
                        self.cfg["server_url"], self.cfg["api_key"], self.session_token,
                        app, title, risk, AGENT_VERSION,
                    )
                    if response.get("ok"):
                        self.last_heartbeat_ok = time.monotonic()
                    if response.get("sessionInvalid"):
                        self._clear_user()
            self.stop_event.wait(HEARTBEAT_SECONDS)


def make_handler(runtime: MachineRuntime):
    class BridgeHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args) -> None:
            logger.debug(format, *args)

        def respond(self, status: int, body: dict) -> None:
            payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def authorized(self) -> bool:
            return hmac.compare_digest(self.headers.get("X-Local-Agent-Token", ""), runtime.bridge_token)

        def do_GET(self) -> None:
            if not self.authorized():
                return self.respond(403, {"error": "Forbidden"})
            if self.path == "/status":
                return self.respond(200, runtime.status())
            self.respond(404, {"error": "Not found"})

        def do_POST(self) -> None:
            if not self.authorized():
                return self.respond(403, {"error": "Forbidden"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.respond(400, {"error": "Invalid Content-Length"})
            if length < 0 or length > 4096:
                return self.respond(413, {"error": "Request too large"})
            try:
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError("Expected object")
            except (ValueError, UnicodeDecodeError):
                return self.respond(400, {"error": "Invalid JSON"})
            if self.path == "/activate":
                result = runtime.activate(data.get("code", ""))
            elif self.path == "/login":
                result = runtime.login(str(data.get("email", ""))[:320], str(data.get("password", ""))[:1024])
            elif self.path == "/logout":
                result = runtime.logout()
            elif self.path == "/activity":
                result = runtime.submit_activity(
                    str(data["app"]) if data.get("app") else None,
                    str(data["title"]) if data.get("title") else None,
                )
            else:
                return self.respond(404, {"error": "Not found"})
            self.respond(200 if result.get("ok") else 400, result)

    return BridgeHandler


def run(stop_event: Optional[threading.Event] = None) -> None:
    os.environ["ELEGANT_AGENT_SERVICE"] = "1"
    logging_setup.configure_logging()
    runtime = MachineRuntime()
    if stop_event is not None:
        runtime.stop_event = stop_event
    runtime.publish_bridge_token()
    server = ThreadingHTTPServer((BRIDGE_HOST, BRIDGE_PORT), make_handler(runtime))
    server.timeout = 1
    thread = threading.Thread(target=runtime.heartbeat_loop, name="machine-heartbeat", daemon=True)
    thread.start()
    logger.info("Machine service listening on loopback")
    try:
        while not runtime.stop_event.is_set():
            server.handle_request()
    finally:
        runtime.stop_event.set()
        server.server_close()
        config.bridge_token_path().unlink(missing_ok=True)
        logger.info("Machine service stopped")


if __name__ == "__main__":
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    run(stop)
