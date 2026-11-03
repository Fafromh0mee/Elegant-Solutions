import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

from platform_support import detect_session_type  # noqa: E402
from platform_support import linux  # noqa: E402
from platform_support import windows  # noqa: E402
import blocker  # noqa: E402


class PlatformSupportTests(unittest.TestCase):
    def test_session_type_prefers_explicit_xdg_value(self):
        with patch.dict(os.environ, {"XDG_SESSION_TYPE": "x11", "DISPLAY": ""}, clear=False):
            self.assertEqual(detect_session_type(), "x11")

    def test_session_type_detects_wayland_from_display_variable(self):
        with patch.dict(os.environ, {}, clear=True):
            os.environ["WAYLAND_DISPLAY"] = "wayland-0"
            self.assertEqual(detect_session_type(), "wayland")

    def test_wayland_never_fabricates_active_window_data(self):
        with patch.dict(os.environ, {"XDG_SESSION_TYPE": "wayland"}, clear=True):
            info = linux.get_active_window()

        self.assertFalse(info.available)
        self.assertEqual(info.app_name, "")
        self.assertEqual(info.window_title, "")
        self.assertIsNone(info.pid)
        self.assertIn("Wayland", info.reason)

    def test_windows_fallback_preserves_existing_process_behavior(self):
        class FakeProcess:
            def __init__(self, name, cpu, pid):
                self.info = {"name": name, "cpu_percent": cpu}
                self.pid = pid

        with patch.object(windows, "_WIN32_AVAILABLE", False), patch.object(
            windows.psutil, "process_iter", return_value=[
                FakeProcess("idle.exe", 1, 10),
                FakeProcess("active.exe", 20, 20),
            ]
        ):
            info = windows.get_active_window()

        self.assertTrue(info.available)
        self.assertEqual(info.app_name, "active")
        self.assertEqual(info.window_title, "")
        self.assertEqual(info.pid, 20)

    def test_linux_hosts_blocker_is_a_noop(self):
        with patch.object(blocker, "_IS_LINUX", True), patch.object(
            blocker, "_write_hosts", side_effect=AssertionError("must not write hosts")
        ):
            self.assertTrue(blocker.apply_blacklist(["example.com"]))


if __name__ == "__main__":
    unittest.main()
