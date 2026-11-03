import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

import notifier  # noqa: E402
from main import AgentState  # noqa: E402


class LifecycleTests(unittest.TestCase):
    def test_warning_is_scheduled_at_fifteen_minutes(self):
        now = datetime(2030, 1, 1, 0, 0, tzinfo=timezone.utc)
        expires = "2030-01-01T01:00:00.000Z"
        self.assertEqual(notifier.expiry_warning_delay(expires, now), 45 * 60)

    def test_warning_is_immediate_when_less_than_fifteen_minutes_remain(self):
        now = datetime(2030, 1, 1, 0, 50, tzinfo=timezone.utc)
        self.assertEqual(notifier.expiry_warning_delay("2030-01-01T01:00:00Z", now), 0)

    def test_local_clear_removes_only_agent_session_identity(self):
        state = AgentState()
        state.cfg = {"room_code": "LAB-401"}
        state.set_session({
            "sessionToken": "opaque-token",
            "expiresAt": "2030-01-01T01:00:00Z",
            "user": {"email": "user@example.test", "name": "User"},
            "room": {"roomCode": "LAB-401"},
        })
        state.clear_user()
        self.assertEqual(state.get_session_token(), "")
        self.assertIsNone(state.get_session_ends_at())
        self.assertEqual(state.room_code, "LAB-401")

    def test_rescheduling_after_extension_cancels_previous_warning_and_expiry(self):
        timers = []

        class FakeTimer:
            def __init__(self, delay, callback, args=()):
                self.delay = delay
                self.callback = callback
                self.args = args
                self.daemon = False
                self.cancelled = False
                timers.append(self)

            def start(self):
                pass

            def cancel(self):
                self.cancelled = True

        now = datetime.now(timezone.utc)
        first = (now.replace(microsecond=0) + timedelta(minutes=20)).isoformat()
        extended = (now.replace(microsecond=0) + timedelta(minutes=40)).isoformat()
        with patch.object(notifier.threading, "Timer", FakeTimer):
            notifier.schedule_expiry_warnings(first, on_expire=lambda: None)
            self.assertEqual(len(timers), 2)
            notifier.schedule_expiry_warnings(extended, on_expire=lambda: None)
            self.assertEqual(len(timers), 4)
            self.assertTrue(all(timer.cancelled for timer in timers[:2]))
            self.assertTrue(all(not timer.cancelled for timer in timers[2:]))
        notifier._cancel_all()


if __name__ == "__main__":
    unittest.main()
