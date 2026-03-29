"""
HTTP client for communicating with the Next.js web server.
All requests are synchronous (called from background threads).
"""
import logging
from typing import Optional
import requests

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
) -> Optional[dict]:
    """Register this machine and retrieve its API key."""
    url = f"{server_url.rstrip('/')}/api/agent/register"
    payload: dict = {"machineCode": machine_code, "hostname": hostname}
    if room_code:
        payload["roomCode"] = room_code
    try:
        resp = _SESSION.post(
            url,
            json=payload,
            headers={"x-register-secret": register_secret},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.error("register_machine failed: %s", exc)
        return None


def send_heartbeat(
    server_url: str,
    api_key: str,
    user_email: str = "",
    active_app: str = "",
    active_title: str = "",
    risk_level: str = "NORMAL",
) -> bool:
    """Send activity heartbeat. Returns True on success."""
    url = f"{server_url.rstrip('/')}/api/agent/heartbeat"
    payload = {
        "userEmail": user_email,
        "activeApp": active_app,
        "activeTitle": active_title,
        "riskLevel": risk_level,
    }
    try:
        resp = _SESSION.post(
            url,
            json=payload,
            headers={"x-agent-key": api_key},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        logger.warning("send_heartbeat failed: %s", exc)
        return False


def fetch_config(server_url: str, api_key: str) -> Optional[dict]:
    """Fetch blacklist and session info from server."""
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
        logger.warning("fetch_config failed: %s", exc)
        return None


def verify_user(server_url: str, email: str, password: str) -> Optional[dict]:
    """Verify user credentials via the agent login endpoint."""
    url = f"{server_url.rstrip('/')}/api/agent/auth"
    try:
        resp = _SESSION.post(
            url,
            json={"email": email, "password": password},
            timeout=TIMEOUT,
        )
        if resp.status_code == 401:
            return {"error": "อีเมลหรือรหัสผ่านไม่ถูกต้อง"}
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.error("verify_user failed: %s", exc)
        return {"error": str(exc)}
