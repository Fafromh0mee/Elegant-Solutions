import sys
import unittest
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

from logging_setup import safe_exception  # noqa: E402


class LoggingSafetyTests(unittest.TestCase):
    def test_secret_shaped_exception_text_is_redacted(self):
        message = safe_exception(
            RuntimeError("api_key=pilot-test-value activation_code=123456 bearer pilot-token-value")
        )
        self.assertNotIn("pilot-test-value", message)
        self.assertNotIn("123456", message)
        self.assertNotIn("pilot-token-value", message)
        self.assertIn("<redacted>", message)


if __name__ == "__main__":
    unittest.main()
