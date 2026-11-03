import sys
import unittest
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

from version import AGENT_VERSION  # noqa: E402


class AgentVersionTests(unittest.TestCase):
    def test_canonical_version_is_shared_by_the_agent_runtime(self):
        self.assertRegex(AGENT_VERSION, r"^\d+\.\d+\.\d+$")


if __name__ == "__main__":
    unittest.main()
