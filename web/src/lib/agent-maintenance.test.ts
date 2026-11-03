import { describe, expect, it } from "vitest";
import { createMaintenanceCode, hashMaintenanceCode, isMaintenanceAction } from "@/lib/agent-maintenance";
import { hashAgentOneTimeCode } from "@/lib/agent-one-time-code";
import { createAgentSessionToken, hashAgentSessionToken } from "@/lib/agent-session";

describe("Agent security primitives", () => {
  it("creates opaque session tokens and stores only their hash", () => {
    const token = createAgentSessionToken();
    expect(token).toHaveLength(43);
    expect(hashAgentSessionToken(token)).not.toBe(token);
  });

  it("creates six-digit maintenance codes without reusing session token logic", () => {
    process.env.AUTH_SECRET = "test-auth-secret-for-agent-code-hashing";
    const code = createMaintenanceCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hashMaintenanceCode(code)).not.toBe(code);
    expect(hashMaintenanceCode(code)).toBe(hashMaintenanceCode(code));
    expect(hashMaintenanceCode(code)).not.toBe(hashAgentOneTimeCode("activation", code));
    expect(isMaintenanceAction("UNINSTALL_AGENT")).toBe(true);
    expect(isMaintenanceAction("QUIT_AGENT")).toBe(false);
  });
});
