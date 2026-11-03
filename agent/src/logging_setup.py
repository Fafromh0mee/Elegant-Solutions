"""Persistent, secret-safe logging for the windowed Agent build."""
import logging
import re
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

import config

_HANDLER_MARKER = "_elegant_agent_handler"
_MAX_BYTES = 5 * 1024 * 1024
_BACKUP_COUNT = 3

_SENSITIVE_ASSIGNMENT = re.compile(
    r"(?i)(\b(?:password|secret|token|api[_-]?key|activation[_-]?code|authorization|"
    r"x-agent-key|x-register-secret)\b[\"']?\s*(?:=|:)\s*[\"']?)"
    r"((?:bearer\s+)?[^,\s;&}\"']+)"
)
_BEARER_TOKEN = re.compile(r"(?i)(\bbearer\s+)([^\s,;&}]+)")


def safe_exception(exc: BaseException) -> str:
    """Return a bounded exception description with common secrets redacted."""
    message = str(exc)
    message = _SENSITIVE_ASSIGNMENT.sub(r"\1<redacted>", message)
    message = _BEARER_TOKEN.sub(r"\1<redacted>", message)
    return f"{type(exc).__name__}: {message[:400]}"


def _fallback_log_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent / "logs" / "ElegantAgent.log"
    return Path(__file__).parent.parent / "logs" / "ElegantAgent.log"


def configure_logging() -> Path | None:
    """Install one rotating file handler and an optional development console handler."""
    root = logging.getLogger()
    for handler in root.handlers:
        if getattr(handler, _HANDLER_MARKER, False):
            return Path(getattr(handler, "baseFilename", ""))

    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    candidates = [config.log_dir(), _fallback_log_path().parent]
    for directory in candidates:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            log_path = directory / "ElegantAgent.log"
            file_handler = RotatingFileHandler(
                log_path,
                maxBytes=_MAX_BYTES,
                backupCount=_BACKUP_COUNT,
                encoding="utf-8",
            )
            setattr(file_handler, _HANDLER_MARKER, True)
            file_handler.setFormatter(formatter)
            root.setLevel(logging.INFO)
            root.addHandler(file_handler)

            if sys.stdout is not None and not any(
                isinstance(handler, logging.StreamHandler)
                and not isinstance(handler, RotatingFileHandler)
                for handler in root.handlers
            ):
                console_handler = logging.StreamHandler(sys.stdout)
                console_handler.setFormatter(formatter)
                root.addHandler(console_handler)
            return log_path
        except Exception:
            continue

    logging.basicConfig(level=logging.INFO, format=formatter._fmt)
    return None
