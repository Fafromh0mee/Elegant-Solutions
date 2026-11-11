"""
HTTP client for communicating with the Next.js web server.
All requests are synchronous (called from background threads).
"""
import logging
from typing import Optional
import requests

from logging_setup import safe_exception

logger = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({"Content-Type": "application/json"})

TIMEOUT = 10  # seconds


def register_machine(
    server_url: str,
    register_secret: str,
    machine_code: str,
    hostname: str,
    room_code: str = "",
    platform_name: str = "",
) -> Optional[dict]:
    """Register this machine and retrieve its API key."""
    url = f"{server_url.rstrip('/')}/api/agent/register"
    payload: dict = {"machineCode": machine_code, "hostname": hostname}
    if room_code:
        payload["roomCode"] = room_code
    if platform_name:
        payload["platform"] = platform_name
    try:
        resp = _SESSION.post(
            url,
            json=payload,
            headers={"x-register-secret": register_secret},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        logger.info("Machine registration succeeded")
        return resp.json()
    except Exception as exc:
        logger.error("Machine registration failed: %s", safe_exception(exc))
        return None


def activate_machine(
    server_url: str,
    activation_code: str,
    hostname: str,
    platform_name: str = "",
) -> Optional[dict]:
    """Consume a single-use activation code and retrieve machine runtime credentials."""
    url = f"{server_url.rstrip('/')}/api/agent/activate"
    payload: dict = {"activationCode": activation_code, "hostname": hostname}
    if platform_name:
        payload["platform"] = platform_name
    try:
        response = _SESSION.post(url, json=payload, timeout=TIMEOUT)
        if response.status_code >= 400:
            try:
                return {"error": response.json().get("error", "เปิดใช้งานไม่สำเร็จ")}
            except ValueError:
                return {"error": "เปิดใช้งานไม่สำเร็จ"}
        result = response.json()
        if not result.get("apiKey") or not result.get("machineCode") or not result.get("roomCode"):
            return {"error": "การตอบกลับจากเซิร์ฟเวอร์ไม่สมบูรณ์"}
        logger.info("Machine activation succeeded")
        return result
    except Exception as exc:
        logger.error("Machine activation failed: %s", safe_exception(exc))
        return {"error": "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"}


def send_heartbeat(
    server_url: str,
    api_key: str,
    session_token: str = "",
    active_app: Optional[str] = "",
    active_title: Optional[str] = "",
    risk_level: str = "NORMAL",
    agent_version: str = "",
) -> dict:
    """Send activity heartbeat authenticated by machine and optional Agent session."""
    url = f"{server_url.rstrip('/')}/api/agent/heartbeat"
    payload = {
        "activeApp": active_app,
        "activeTitle": active_title,
        "riskLevel": risk_level,
    }
    if agent_version:
        payload["agentVersion"] = agent_version
    try:
        resp = _SESSION.post(
            url,
            json=payload,
            headers={
                "x-agent-key": api_key,
                **({"x-agent-session": session_token} if session_token else {}),
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 401:
            return {"sessionInvalid": True}
        logger.warning("Heartbeat request failed: %s", safe_exception(exc))
        return {"ok": False}
    except Exception as exc:
        logger.warning("Heartbeat request failed: %s", safe_exception(exc))
        return {"ok": False}


def fetch_config(server_url: str, api_key: str) -> Optional[dict]:
    """Fetch machine configuration and blacklist."""
    url = f"{server_url.rstrip('/')}/api/agent/config"
    try:
        resp = _SESSION.get(
            url,
            headers={"x-agent-key": api_key},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("Configuration sync request failed: %s", safe_exception(exc))
        return None


def verify_user(server_url: str, api_key: str, email: str, password: str) -> Optional[dict]:
    """Authenticate the user and issue a machine/room-bound Agent session."""
    url = f"{server_url.rstrip('/')}/api/agent/auth"
    try:
        resp = _SESSION.post(
            url,
            json={"email": email, "password": password},
            headers={"x-agent-key": api_key},
            timeout=TIMEOUT,
        )
        if resp.status_code >= 400:
            logger.warning("Agent login rejected by server (%s)", resp.status_code)
            try:
                return {"error": resp.json().get("error", "เข้าสู่ระบบไม่สำเร็จ")}
            except ValueError:
                return {"error": "เข้าสู่ระบบไม่สำเร็จ"}
        logger.info("User authentication succeeded")
        return resp.json()
    except Exception as exc:
        logger.error("Authentication request failed: %s", safe_exception(exc))
        return {"error": "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"}


def refresh_session(server_url: str, api_key: str, session_token: str) -> Optional[dict]:
    url = f"{server_url.rstrip('/')}/api/agent/session/refresh"
    try:
        resp = _SESSION.post(
            url,
            headers={"x-agent-key": api_key, "x-agent-session": session_token},
            timeout=TIMEOUT,
        )
        if resp.status_code == 401:
            return {"expired": True}
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("Agent session refresh failed: %s", safe_exception(exc))
        return None


def logout_session(server_url: str, api_key: str, session_token: str) -> bool:
    url = f"{server_url.rstrip('/')}/api/agent/session/logout"
    try:
        resp = _SESSION.post(
            url,
            headers={"x-agent-key": api_key, "x-agent-session": session_token},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        logger.warning("Agent session logout request failed: %s", safe_exception(exc))
        return False


def authorize_maintenance(server_url: str, api_key: str, code: str, action: str) -> bool:
    url = f"{server_url.rstrip('/')}/api/agent/maintenance/authorize"
    try:
        resp = _SESSION.post(
            url,
            json={"code": code, "action": action},
            headers={"x-agent-key": api_key},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return bool(resp.json().get("authorized"))
    except Exception as exc:
        logger.warning("Maintenance authorization failed: %s", safe_exception(exc))
        return False
