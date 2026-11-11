"""
Machine configuration for the Agent.

Frozen builds keep machine configuration in the machine-wide application-data
directory so a Program Files installation can be updated without losing its
runtime state or depending on write access to the executable directory.
"""
import json
import logging
import os
import platform
import sys
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

CONFIG_FILENAME = "config.json"
DEPLOYMENT_FILENAME = "deployment.json"
APP_DATA_DIR = Path("ElegantSolution") / "Agent"
LINUX_CONFIG_DIR = Path("elegant-solution") / "agent"
LINUX_STATE_DIR = Path("elegant-solution") / "agent"
BRIDGE_HOST = "127.0.0.1"
BRIDGE_PORT = 18767

_DEFAULTS = {
    "server_url": "",
    "machine_code": "",
    "api_key": "",
    "room_code": "",
}


def _data_dir() -> Path:
    """Return the writable machine-data directory for this execution mode."""
    if os.environ.get("ELEGANT_AGENT_SERVICE") == "1":
        system = platform.system()
        if system == "Darwin":
            return Path("/Library/Application Support/ElegantSolution/Agent")
        if system == "Linux":
            return Path("/var/lib/elegant-agent")
    if platform.system() == "Darwin":
        return Path.home() / "Library/Application Support/ElegantSolution/Agent"
    if platform.system() == "Linux":
        return _xdg_dir("XDG_CONFIG_HOME", ".config") / LINUX_CONFIG_DIR
    if getattr(sys, "frozen", False):
        program_data = os.environ.get("PROGRAMDATA")
        if program_data:
            return Path(program_data) / APP_DATA_DIR
        return Path(sys.executable).parent
    return Path(__file__).parent.parent


def bridge_token_path() -> Path:
    """A local IPC capability; this file never contains the machine API key."""
    system = platform.system()
    if system == "Windows":
        root = Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData"))
        return root / "ElegantSolution" / "AgentBridge" / "token"
    if system == "Darwin":
        return Path("/Library/Application Support/ElegantSolution/Bridge/token")
    return Path("/run/elegant-agent/token")


def _xdg_dir(variable: str, fallback: str) -> Path:
    value = os.environ.get(variable, "").strip()
    if value and Path(value).is_absolute():
        return Path(value)
    return Path.home() / fallback


def _config_path() -> Path:
    """Return the primary path for the machine configuration file."""
    return _data_dir() / CONFIG_FILENAME


def _legacy_config_path() -> Path | None:
    """Return the old frozen-build config location, if applicable."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent / CONFIG_FILENAME
    return None


def deployment_server_url() -> str:
    """Return the non-secret deployment URL without persisting deployment data."""
    environment_url = os.environ.get("ELEGANT_SERVER_URL", "").strip().rstrip("/")
    if environment_url:
        return environment_url

    deployment_path = Path(__file__).parent.parent / DEPLOYMENT_FILENAME
    if getattr(sys, "frozen", False):
        deployment_path = Path(sys.executable).parent / DEPLOYMENT_FILENAME
    if not deployment_path.exists():
        return ""
    try:
        # Windows PowerShell's UTF-8 output may include a BOM; accept both forms.
        with open(deployment_path, "r", encoding="utf-8-sig") as deployment_file:
            data = json.load(deployment_file)
        server_url = data.get("server_url", "")
        return server_url.strip().rstrip("/") if isinstance(server_url, str) else ""
    except Exception as exc:
        logger.warning("Unable to load Agent deployment configuration (%s)", type(exc).__name__)
        return ""


def log_dir() -> Path:
    """Return the persistent log directory for this execution mode."""
    if os.environ.get("ELEGANT_AGENT_SERVICE") == "1":
        return _data_dir() / "logs"
    if platform.system() == "Linux":
        return _xdg_dir("XDG_STATE_HOME", ".local/state") / LINUX_STATE_DIR / "logs"
    return _data_dir() / "logs"


def load() -> dict:
    path = _config_path()
    legacy_path = _legacy_config_path()
    if not path.exists() and legacy_path and legacy_path.exists():
        # Read legacy installations without copying or shipping their secrets.
        path = legacy_path
    if not path.exists():
        return dict(_DEFAULTS)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {**_DEFAULTS, **data}
    except Exception as exc:
        logger.warning("Unable to load Agent configuration (%s)", type(exc).__name__)
        return dict(_DEFAULTS)


def save(cfg: dict) -> None:
    path = _config_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".config-", dir=path.parent)
        try:
            if platform.system() != "Windows":
                os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    except Exception as exc:
        logger.error("Unable to save Agent configuration (%s)", type(exc).__name__)
        raise


def is_configured(cfg: dict) -> bool:
    return bool(cfg.get("server_url") and cfg.get("machine_code") and cfg.get("api_key"))
