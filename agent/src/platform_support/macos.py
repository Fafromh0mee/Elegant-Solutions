"""Best-effort foreground detection in the logged-in macOS desktop session.

System Events requires Automation/Accessibility consent. A denied permission
is reported as unavailable; the machine service still heartbeats.
"""
import subprocess

from . import ActiveWindowInfo

_SCRIPT = '''
tell application "System Events"
    set focusedApp to first application process whose frontmost is true
    set appName to name of focusedApp
    try
        set windowName to name of front window of focusedApp
    on error
        set windowName to ""
    end try
    return appName & linefeed & windowName
end tell
'''


def capability_status() -> str:
    return "macos-system-events-consent-required"


def get_active_window() -> ActiveWindowInfo:
    try:
        result = subprocess.run(
            ["/usr/bin/osascript", "-e", _SCRIPT],
            capture_output=True, text=True, timeout=4, check=True,
        )
        app, _, title = result.stdout.strip().partition("\n")
        if not app:
            return ActiveWindowInfo(reason="macOS did not report a foreground application")
        return ActiveWindowInfo(app_name=app, window_title=title, available=True)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return ActiveWindowInfo(reason="macOS Automation or Accessibility access is unavailable")
