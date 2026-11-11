"""Local administrator authorization before managed restart/uninstall."""
import getpass
import os
import sys

os.environ["ELEGANT_AGENT_SERVICE"] = "1"

import api_client
import config


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"RESTART_AGENT", "UNINSTALL_AGENT"}:
        print("Usage: elegant-agent-maintenance RESTART_AGENT|UNINSTALL_AGENT", file=sys.stderr)
        return 2
    cfg = config.load()
    if not config.is_configured(cfg):
        print("Machine is not activated", file=sys.stderr)
        return 1
    code = getpass.getpass(f"{sys.argv[1]} Maintenance Code: ").strip()
    if len(code) != 6 or not code.isdigit():
        print("Invalid Maintenance Code", file=sys.stderr)
        return 1
    if not api_client.authorize_maintenance(cfg["server_url"], cfg["api_key"], code, sys.argv[1]):
        print("Maintenance Code rejected", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
