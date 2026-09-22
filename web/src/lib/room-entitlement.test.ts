import { describe, expect, it } from "vitest";
import { CLASS_EARLY_ACCESS_MINUTES, classAccessWindow } from "@/lib/room-entitlement";

// Pure class access window. Also meaningful under TZ=America/New_York: nothing here
// may depend on the host zone.

describe("classAccessWindow", () => {
  it("canonical slot: 30 minutes before the slot's Bangkok start until its end", () => {
    expect(CLASS_EARLY_ACCESS_MINUTES).toBe(30);
    const window = classAccessWindow("2030-01-07", { slot: "SLOT_3", startTime: "ignored", endTime: "ignored" });
    expect(window?.startAt.toISOString()).toBe("2030-01-07T07:00:00.000Z"); // 14:00 Bangkok
    expect(window?.endAt.toISOString()).toBe("2030-01-07T09:50:00.000Z"); // 16:50 Bangkok
  });

  it("the canonical slot wins over a row's (possibly stale) time strings", () => {
    const window = classAccessWindow("2030-01-07", { slot: "SLOT_2", startTime: "07:00", endTime: "08:00" });
    expect(window?.startAt.toISOString()).toBe("2030-01-07T04:30:00.000Z"); // 11:30 Bangkok
  });

  it("legacy off-grid row: its own Bangkok wall-clock times", () => {
    const window = classAccessWindow("2030-01-07", { slot: null, startTime: "07:00", endTime: "08:00" });
    expect(window?.startAt.toISOString()).toBe("2030-01-06T23:30:00.000Z"); // 06:30 Bangkok = previous UTC day
    expect(window?.endAt.toISOString()).toBe("2030-01-07T01:00:00.000Z");
  });

  it("malformed or inverted legacy times are unusable (never grant)", () => {
    expect(classAccessWindow("2030-01-07", { slot: null, startTime: "7:00", endTime: "08:00" })).toBeNull();
    expect(classAccessWindow("2030-01-07", { slot: null, startTime: "09:00", endTime: "08:00" })).toBeNull();
    expect(classAccessWindow("2030-01-07", { slot: null, startTime: "25:00", endTime: "26:00" })).toBeNull();
  });
});
