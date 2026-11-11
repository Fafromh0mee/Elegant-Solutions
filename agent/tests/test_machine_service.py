import pathlib
import sys
import threading
import unittest
import json
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))

import machine_service


class MachineRuntimeTests(unittest.TestCase):
    def configured(self):
        with patch.object(machine_service.config, "load", return_value={
            "server_url": "https://example.invalid", "machine_code": "LAB-PC01",
            "room_code": "LAB", "api_key": "test-key",
        }):
            return machine_service.MachineRuntime()

    def test_machine_heartbeat_does_not_collect_student_activity_without_login(self):
        runtime = self.configured()
        with patch.object(machine_service.api_client, "fetch_config", return_value={"blacklist": []}), \
             patch.object(machine_service.api_client, "send_heartbeat", return_value={"ok": True}) as send:
            runtime.stop_event.wait = lambda _: runtime.stop_event.set()
            runtime.heartbeat_loop()
        self.assertEqual(send.call_args.args[2], "")
        self.assertIsNone(send.call_args.args[3])
        self.assertIsNone(send.call_args.args[4])
        self.assertTrue(runtime.status()["online"])

    def test_login_keeps_machine_key_private_and_sends_session_activity(self):
        runtime = self.configured()
        with patch.object(machine_service.api_client, "verify_user", return_value={
            "sessionToken": "session-secret", "expiresAt": "2030-01-01T00:00:00Z",
            "user": {"name": "Student", "email": "student@example.test"},
        }):
            result = runtime.login("student@example.test", "password")
        self.assertNotIn("sessionToken", result)
        self.assertNotIn("apiKey", result)
        runtime.submit_activity("Editor", "Document")
        with patch.object(machine_service.api_client, "fetch_config", return_value={"blacklist": []}), \
             patch.object(machine_service.api_client, "send_heartbeat", return_value={"ok": True}) as send:
            runtime.stop_event.wait = lambda _: runtime.stop_event.set()
            runtime.heartbeat_loop()
        self.assertEqual(send.call_args.args[2], "session-secret")
        self.assertEqual(send.call_args.args[3:5], ("Editor", "Document"))

    def test_expired_user_session_leaves_machine_activated(self):
        runtime = self.configured()
        runtime.session_token = "old-token"
        runtime.session_ends_at = "2000-01-01T00:00:00Z"
        with patch.object(machine_service.api_client, "refresh_session", return_value={"expired": True}):
            runtime._refresh_due_session()
        self.assertIsNone(runtime.status()["user"])
        self.assertTrue(runtime.status()["activated"])

    def test_local_bridge_requires_capability_and_never_exposes_machine_key(self):
        runtime = self.configured()
        server = ThreadingHTTPServer(("127.0.0.1", 0), machine_service.make_handler(runtime))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}/status"
        try:
            with self.assertRaises(urllib.error.HTTPError) as denied:
                urllib.request.urlopen(url, timeout=2)
            self.assertEqual(denied.exception.code, 403)
            request = urllib.request.Request(url, headers={"X-Local-Agent-Token": runtime.bridge_token})
            with urllib.request.urlopen(request, timeout=2) as response:
                status = json.load(response)
            self.assertEqual(status["machineCode"], "LAB-PC01")
            self.assertNotIn("api_key", json.dumps(status))
            self.assertNotIn("test-key", json.dumps(status))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
