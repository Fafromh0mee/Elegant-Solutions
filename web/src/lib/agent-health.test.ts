import { describe, expect, it } from "vitest";
import { currentAgentActivity } from "@/lib/agent-health";

const issuedAt = new Date("2030-01-01T10:00:00Z");
const session = { userId: "student-2", issuedAt };
const current = { userId: "student-2", createdAt: new Date("2030-01-01T10:01:00Z"), activeTitle: "Work" };

describe("current Agent activity", () => {
  it("shows activity only from an online machine's current user session", () => {
    expect(currentAgentActivity(true, session, current)).toBe(current);
    expect(currentAgentActivity(true, null, current)).toBeNull();
    expect(currentAgentActivity(false, session, current)).toBeNull();
    expect(currentAgentActivity(true, session, { ...current, userId: "student-1" })).toBeNull();
    expect(currentAgentActivity(true, session, { ...current, createdAt: new Date("2030-01-01T09:59:00Z") })).toBeNull();
  });
});
