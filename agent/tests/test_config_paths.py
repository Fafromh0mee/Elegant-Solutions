import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

import config  # noqa: E402


class ConfigPathTests(unittest.TestCase):
    def test_deployment_url_prefers_environment_and_normalizes_trailing_slash(self):
        with patch.dict(os.environ, {"ELEGANT_SERVER_URL": "https://pilot.example/"}, clear=False):
            self.assertEqual(config.deployment_server_url(), "https://pilot.example")

    def test_deployment_url_reads_non_secret_release_config(self):
        with tempfile.TemporaryDirectory() as root:
            deployment = Path(root) / "deployment.json"
            deployment.write_text('{"server_url": "https://pilot.example/"}', encoding="utf-8-sig")
            with patch.dict(os.environ, {"ELEGANT_SERVER_URL": ""}, clear=False), patch.object(
                config.sys, "frozen", False, create=True
            ), patch.object(config, "__file__", str(Path(root) / "src" / "config.py")):
                self.assertEqual(config.deployment_server_url(), "https://pilot.example")

    def test_linux_uses_xdg_config_and_state_paths(self):
        with tempfile.TemporaryDirectory() as root:
            config_home = Path(root) / "config"
            state_home = Path(root) / "state"
            with patch.dict(
                os.environ,
                {
                    "XDG_CONFIG_HOME": str(config_home),
                    "XDG_STATE_HOME": str(state_home),
                },
                clear=False,
            ), patch.object(config.platform, "system", return_value="Linux"), patch.object(
                config.sys, "frozen", False, create=True
            ):
                self.assertEqual(
                    config._config_path(),
                    config_home / "elegant-solution" / "agent" / "config.json",
                )
                self.assertEqual(
                    config.log_dir(),
                    state_home / "elegant-solution" / "agent" / "logs",
                )

    def test_frozen_windows_keeps_programdata_paths(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.dict(os.environ, {"PROGRAMDATA": root}, clear=False), patch.object(
                config.platform, "system", return_value="Windows"
            ), patch.object(config.sys, "frozen", True, create=True), patch.object(
                config.sys, "executable", str(Path(root) / "Agent.exe")
            ):
                self.assertEqual(
                    config._config_path(),
                    Path(root) / "ElegantSolution" / "Agent" / "config.json",
                )
                self.assertEqual(
                    config.log_dir(),
                    Path(root) / "ElegantSolution" / "Agent" / "logs",
                )


if __name__ == "__main__":
    unittest.main()
