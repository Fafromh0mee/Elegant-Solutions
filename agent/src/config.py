"""
Machine configuration — reads/writes config.json next to the executable.
"""
import json
import os
import sys
from pathlib import Path

CONFIG_FILENAME = "config.json"

_DEFAULTS = {
    "server_url": "",
    "machine_code": "",
    "api_key": "",
    "room_code": "",
}


def _config_path() -> Path:
    """Return path to config.json relative to the executable / script location."""
    if getattr(sys, "frozen", False):
        # Running as PyInstaller bundle
        base = Path(sys.executable).parent
    else:
        base = Path(__file__).parent.parent
    return base / CONFIG_FILENAME


def load() -> dict:
    path = _config_path()
    if not path.exists():
        return dict(_DEFAULTS)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {**_DEFAULTS, **data}
    except Exception:
        return dict(_DEFAULTS)


def save(cfg: dict) -> None:
    path = _config_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def is_configured(cfg: dict) -> bool:
    return bool(cfg.get("server_url") and cfg.get("machine_code") and cfg.get("api_key"))
