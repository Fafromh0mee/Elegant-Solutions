import { describe, expect, it } from "vitest";
import { addAcademicDays, hasSlotEnded, isContiguousSlotSelection } from "@/lib/academic-slots";
import { getBookingHorizonEnd, isWithinBookingHorizon, ROOM_BOOKING_HORIZON_DAYS } from "@/lib/booking-rules";

describe("booking horizon (shared with Feature 7)", () => {
  const today = "2026-09-22";

  it("is 30 days", () => expect(ROOM_BOOKING_HORIZON_DAYS).toBe(30));
  it("ends 30 calendar days after today, across month ends", () => {
    expect(getBookingHorizonEnd(today)).toBe("2026-10-22");
    expect(getBookingHorizonEnd("2026-12-15")).toBe("2027-01-14");
    expect(getBookingHorizonEnd("2028-02-10")).toBe("2028-03-11"); // leap year
  });

  it.each([
    ["2026-09-22", true],
    ["2026-10-22", true],
    ["2026-09-21", false],
    ["2026-10-23", false],
    ["2026-02-30", false],
    [" 2026-09-23", false],
    ["2026-9-23", false],
  ])("%s -> %s", (date, expected) => {
    expect(isWithinBookingHorizon(date, today)).toBe(expected);
  });
});

describe("addAcademicDays", () => {
  it("does pure calendar math", () => {
    expect(addAcademicDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addAcademicDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("isContiguousSlotSelection", () => {
  it.each([
    [["SLOT_1"], true],
    [["SLOT_2", "SLOT_3"], true],
    [["SLOT_3", "SLOT_2"], true],
    [["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"], true],
    [["SLOT_1", "SLOT_3"], false],
    [["SLOT_2", "SLOT_4"], false],
    [["SLOT_2", "SLOT_2"], false],
    [[], false],
    [["SLOT_5"], false],
  ])("%j -> %s", (slots, expected) => {
    expect(isContiguousSlotSelection(slots)).toBe(expected);
  });
});

describe("hasSlotEnded (Asia/Bangkok)", () => {
  // SLOT_1 is 08:40-11:00 Bangkok = 01:40-04:00Z.
  it("is false before the end and true from the end", () => {
    expect(hasSlotEnded("2026-09-22", "SLOT_1", new Date("2026-09-22T03:59:00Z"))).toBe(false);
    expect(hasSlotEnded("2026-09-22", "SLOT_1", new Date("2026-09-22T04:00:00Z"))).toBe(true);
  });
});
