import { describe, expect, it } from "vitest";
import {
  evaluateAvailability,
  isClassScheduleInForce,
  summarizeBookingCapacity,
  validateAvailabilityRequest,
  validateRoomSearchFilters,
  type AvailabilityRequest,
  type ClassContext,
  type ClosureContext,
  type RoomAvailabilityContext,
} from "@/lib/availability";
import { toAcademicDateString } from "@/lib/academic-slots";
import type { AcademicSlot } from "@/lib/types";

// Pure tests: no database, no Prisma, no rendering. Fixtures mirror the seeded
// local demo so this matrix and scripts/availability-check.ts describe one world.

const ALL_SLOTS: AcademicSlot[] = ["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"];

const LAB_01 = {
  id: "room-lab-01",
  roomCode: "LAB-01",
  name: "ห้อง Lab",
  isActive: true,
  bookingEnabled: true,
  approvalPolicy: "AUTO" as const,
  capabilities: ["LAB" as const, "CLASSROOM" as const],
  capacity: 15,
  building: null,
  floor: null,
};

function context(overrides: Partial<RoomAvailabilityContext> = {}): RoomAvailabilityContext {
  return {
    room: LAB_01,
    dayOfWeek: 1,
    activeSemester: "2/2026",
    windowSlots: ALL_SLOTS,
    closures: [],
    classes: [],
    approvedPartySizeBySlot: {},
    pendingPartySizeBySlot: {},
    configWarnings: [],
    ...overrides,
  };
}

function request(overrides: Partial<AvailabilityRequest> = {}): AvailabilityRequest {
  return { date: "2026-09-28", slots: ["SLOT_1"], partySize: 4, ...overrides };
}

const closure = (over: Partial<ClosureContext> = {}): ClosureContext => ({
  id: "demo-closure-lab01-slot3",
  reason: "ปิดปรับปรุงอุปกรณ์ช่วงคาบ 3",
  startDate: "2026-09-29",
  endDate: "2026-09-29",
  slots: ["SLOT_3"],
  ...over,
});

const klass = (over: Partial<ClassContext> = {}): ClassContext => ({
  id: "class-1",
  slot: "SLOT_1",
  startTime: "08:40",
  endTime: "11:00",
  subjectCode: "DEMO101",
  subjectName: "การเขียนโปรแกรมเบื้องต้น",
  section: "DEMO-A",
  semester: "2/2026",
  ...over,
});

describe("room-level blockers (short-circuit, no per-slot detail)", () => {
  it("1. inactive room -> ROOM_INACTIVE", () => {
    const r = evaluateAvailability(context({ room: { ...LAB_01, isActive: false } }), request());
    expect(r).toMatchObject({ available: false, status: "ROOM_INACTIVE", slots: [] });
  });

  it("2. booking disabled -> BOOKING_DISABLED", () => {
    const r = evaluateAvailability(context({ room: { ...LAB_01, bookingEnabled: false } }), request());
    expect(r).toMatchObject({ available: false, status: "BOOKING_DISABLED", slots: [] });
  });

  it("3. capabilities=[] -> NOT_CONFIGURED_CAPABILITIES", () => {
    const r = evaluateAvailability(context({ room: { ...LAB_01, capabilities: [] } }), request());
    expect(r.status).toBe("NOT_CONFIGURED_CAPABILITIES");
  });

  it.each([0, -3])("4. capacity=%i -> NOT_CONFIGURED_CAPACITY, never FULL", (capacity) => {
    const r = evaluateAvailability(context({ room: { ...LAB_01, capacity } }), request());
    expect(r.status).toBe("NOT_CONFIGURED_CAPACITY");
    expect(r.status).not.toBe("FULL");
  });

  it("5. capability mismatch -> CAPABILITY_MISMATCH", () => {
    const r = evaluateAvailability(context(), request({ requiredCapability: "EVENT" }));
    expect(r.status).toBe("CAPABILITY_MISMATCH");
    expect(evaluateAvailability(context(), request({ requiredCapability: "LAB" })).available).toBe(true);
  });

  it("room-level precedence: inactive beats every later blocker", () => {
    const r = evaluateAvailability(
      context({ room: { ...LAB_01, isActive: false, bookingEnabled: false, capabilities: [], capacity: 0 } }),
      request()
    );
    expect(r.status).toBe("ROOM_INACTIVE");
  });
});

describe("window, closure and class", () => {
  it("6. no matching availability window -> OUTSIDE_WINDOW (fail-closed)", () => {
    const r = evaluateAvailability(
      context({ windowSlots: ["SLOT_1", "SLOT_2", "SLOT_3"] }),
      request({ slots: ["SLOT_4"] })
    );
    expect(r.status).toBe("OUTSIDE_WINDOW");
    expect(evaluateAvailability(context({ windowSlots: [] }), request()).status).toBe("OUTSIDE_WINDOW");
  });

  it("7. slot-specific closure blocks only listed slots", () => {
    const ctx = context({ closures: [closure()] });
    const closed = evaluateAvailability(ctx, request({ date: "2026-09-29", slots: ["SLOT_3"] }));
    expect(closed.status).toBe("CLOSED");
    expect(closed.slots[0].closure).toMatchObject({ wholeRange: false, reason: "ปิดปรับปรุงอุปกรณ์ช่วงคาบ 3" });
    expect(evaluateAvailability(ctx, request({ date: "2026-09-29", slots: ["SLOT_2"] })).available).toBe(true);
  });

  it("8. whole-range closure (slots=[]) blocks every slot, inclusive at both ends", () => {
    const ctx = context({ closures: [closure({ startDate: "2026-09-28", endDate: "2026-09-30", slots: [] })] });
    for (const date of ["2026-09-28", "2026-09-29", "2026-09-30"]) {
      for (const slot of ALL_SLOTS) {
        const r = evaluateAvailability(ctx, request({ date, slots: [slot] }));
        expect(r.status).toBe("CLOSED");
        expect(r.slots[0].closure?.wholeRange).toBe(true);
      }
    }
    // Outside the range the closure has no effect.
    expect(evaluateAvailability(ctx, request({ date: "2026-10-01" })).available).toBe(true);
  });

  it("9. modern ClassSchedule matching the AcademicSlot -> CLASS_IN_SESSION", () => {
    const r = evaluateAvailability(context({ classes: [klass()] }), request({ partySize: 1 }));
    expect(r.status).toBe("CLASS_IN_SESSION");
    expect(r.slots[0].blockingClass).toMatchObject({ matchedBy: "SLOT", subjectCode: "DEMO101" });
    // No capacity sharing during a class: remaining capacity is irrelevant.
    expect(r.slots[0].remainingCapacity).toBe(15);
  });

  it("10. legacy slot=NULL overlapping the slot -> CLASS_IN_SESSION by TIME_OVERLAP", () => {
    const legacy = klass({ slot: null, startTime: "09:00", endTime: "11:00" });
    const r = evaluateAvailability(context({ classes: [legacy] }), request());
    expect(r.status).toBe("CLASS_IN_SESSION");
    expect(r.slots[0].blockingClass?.matchedBy).toBe("TIME_OVERLAP");
  });

  it("11. legacy slot=NULL not overlapping does not block (touching boundaries included)", () => {
    // Ends exactly when SLOT_1 starts, and starts exactly when it ends.
    const before = klass({ slot: null, startTime: "07:00", endTime: "08:40" });
    const after = klass({ id: "class-2", slot: null, startTime: "11:00", endTime: "12:00" });
    const r = evaluateAvailability(context({ classes: [before, after] }), request());
    expect(r.available).toBe(true);
  });
});

describe("capacity", () => {
  it("12. no bookings -> AVAILABLE with full capacity", () => {
    const r = evaluateAvailability(context(), request());
    expect(r).toMatchObject({ available: true, status: "AVAILABLE", remainingCapacity: 15 });
  });

  it("13. APPROVED booking with capacity remaining", () => {
    const r = evaluateAvailability(
      context({ approvedPartySizeBySlot: { SLOT_3: 10 } }),
      request({ slots: ["SLOT_3"], partySize: 4 })
    );
    expect(r.available).toBe(true);
    expect(r.slots[0]).toMatchObject({ bookedCapacity: 10, remainingCapacity: 5 });
  });

  it("14. APPROVED bookings causing FULL", () => {
    const r = evaluateAvailability(context({ approvedPartySizeBySlot: { SLOT_1: 15 } }), request({ partySize: 1 }));
    expect(r).toMatchObject({ status: "FULL", remainingCapacity: 0 });
  });

  it("15. PENDING does not consume capacity, but is reported", () => {
    const summary = summarizeBookingCapacity([{ status: "PENDING", partySize: 6, slots: ["SLOT_1"] }]);
    expect(summary.approvedPartySizeBySlot).toEqual({});

    const r = evaluateAvailability(context(summary), request({ partySize: 15 }));
    expect(r.available).toBe(true);
    expect(r.slots[0]).toMatchObject({ bookedCapacity: 0, remainingCapacity: 15, pendingCapacity: 6 });
  });

  it("16. CANCELLED does not consume capacity", () => {
    const summary = summarizeBookingCapacity([{ status: "CANCELLED", partySize: 15, slots: ["SLOT_1"] }]);
    expect(summary).toEqual({ approvedPartySizeBySlot: {}, pendingPartySizeBySlot: {} });
    expect(evaluateAvailability(context(summary), request({ partySize: 15 })).available).toBe(true);
  });

  it("17. REJECTED does not consume capacity", () => {
    const summary = summarizeBookingCapacity([{ status: "REJECTED", partySize: 15, slots: ["SLOT_1"] }]);
    expect(summary).toEqual({ approvedPartySizeBySlot: {}, pendingPartySizeBySlot: {} });
    expect(evaluateAvailability(context(summary), request({ partySize: 15 })).available).toBe(true);
  });

  it("summarizeBookingCapacity sums APPROVED per slot across bookings, multi-slot included", () => {
    const summary = summarizeBookingCapacity([
      { status: "APPROVED", partySize: 8, slots: ["SLOT_1", "SLOT_2"] },
      { status: "APPROVED", partySize: 3, slots: ["SLOT_2"] },
      { status: "PENDING", partySize: 5, slots: ["SLOT_2"] },
      { status: "CANCELLED", partySize: 99, slots: ["SLOT_2"] },
    ]);
    expect(summary.approvedPartySizeBySlot).toEqual({ SLOT_1: 8, SLOT_2: 11 });
    expect(summary.pendingPartySizeBySlot).toEqual({ SLOT_2: 5 });
  });

  it("20. partySize exactly equals remaining capacity -> AVAILABLE; one more -> FULL", () => {
    const ctx = context({ approvedPartySizeBySlot: { SLOT_1: 10 } });
    expect(evaluateAvailability(ctx, request({ partySize: 5 })).status).toBe("AVAILABLE");
    expect(evaluateAvailability(ctx, request({ partySize: 6 })).status).toBe("FULL");
  });
});

describe("multi-slot", () => {
  it("18. all slots pass -> AVAILABLE with per-slot detail", () => {
    const r = evaluateAvailability(context(), request({ slots: ["SLOT_1", "SLOT_2"] }));
    expect(r.available).toBe(true);
    expect(r.slots.map((s) => s.status)).toEqual(["AVAILABLE", "AVAILABLE"]);
  });

  it("19. one failing slot fails the request; per-slot detail intact", () => {
    const r = evaluateAvailability(
      context({ classes: [klass({ slot: "SLOT_2" })] }),
      request({ slots: ["SLOT_1", "SLOT_2"] })
    );
    expect(r).toMatchObject({ available: false, status: "CLASS_IN_SESSION" });
    expect(r.slots.map((s) => [s.slot, s.status])).toEqual([
      ["SLOT_1", "AVAILABLE"],
      ["SLOT_2", "CLASS_IN_SESSION"],
    ]);
  });

  it("primary status is the highest-precedence failure across slots", () => {
    // SLOT_1 FULL (most contingent), SLOT_2 CLOSED, SLOT_4 no window (most permanent).
    const r = evaluateAvailability(
      context({
        windowSlots: ["SLOT_1", "SLOT_2"],
        approvedPartySizeBySlot: { SLOT_1: 15 },
        closures: [closure({ startDate: "2026-09-28", endDate: "2026-09-28", slots: ["SLOT_2"] })],
      }),
      request({ slots: ["SLOT_1", "SLOT_2", "SLOT_4"], partySize: 1 })
    );
    expect(r.status).toBe("OUTSIDE_WINDOW");
  });

  it("room remainingCapacity is the minimum across requested slots", () => {
    const r = evaluateAvailability(
      context({ approvedPartySizeBySlot: { SLOT_1: 3, SLOT_2: 9 } }),
      request({ slots: ["SLOT_1", "SLOT_2"], partySize: 2 })
    );
    expect(r.remainingCapacity).toBe(6);
  });
});

describe("semester scoping", () => {
  const stale = klass({ id: "stale", semester: "1/2026" });

  it("21. ACTIVE_SEMESTER excludes a stale semester's class", () => {
    const r = evaluateAvailability(context({ activeSemester: "2/2026", classes: [stale] }), request());
    expect(r.available).toBe(true);
    expect(r.configWarnings).toEqual([]);
  });

  it("22. semester=NULL still blocks and emits CLASS_SCHEDULE_SEMESTER_MISSING", () => {
    const unscoped = klass({ id: "unscoped", semester: null });
    const r = evaluateAvailability(context({ classes: [unscoped] }), request());
    expect(r.status).toBe("CLASS_IN_SESSION");
    expect(r.configWarnings).toContain("CLASS_SCHEDULE_SEMESTER_MISSING");
  });

  it("22b. the NULL-semester warning fires even when another class wins the slot", () => {
    const scoped = klass({ id: "scoped", semester: "2/2026" });
    const unscoped = klass({ id: "unscoped", semester: null });
    const r = evaluateAvailability(context({ classes: [scoped, unscoped] }), request());
    expect(r.slots[0].blockingClass?.id).toBe("scoped");
    expect(r.configWarnings).toContain("CLASS_SCHEDULE_SEMESTER_MISSING");
  });

  it("22c. a NULL-semester class that bears on no requested slot does not warn", () => {
    const unscoped = klass({ id: "unscoped", slot: "SLOT_4", semester: null });
    const r = evaluateAvailability(context({ classes: [unscoped] }), request({ slots: ["SLOT_1"] }));
    expect(r.configWarnings).not.toContain("CLASS_SCHEDULE_SEMESTER_MISSING");
  });

  it("23. ACTIVE_SEMESTER unset fails closed (stale semester blocks) and warns", () => {
    const r = evaluateAvailability(context({ activeSemester: null, classes: [stale] }), request());
    expect(r.status).toBe("CLASS_IN_SESSION");
    expect(r.configWarnings).toContain("ACTIVE_SEMESTER_NOT_SET");
  });

  it("isClassScheduleInForce truth table", () => {
    expect(isClassScheduleInForce("2/2026", "2/2026")).toBe(true);
    expect(isClassScheduleInForce(null, "2/2026")).toBe(true);
    expect(isClassScheduleInForce("1/2026", "2/2026")).toBe(false);
    expect(isClassScheduleInForce("1/2026", null)).toBe(true);
    expect(isClassScheduleInForce(null, null)).toBe(true);
  });
});

describe("request validation", () => {
  const base = { date: "2026-09-28", slots: ["SLOT_1"], partySize: 4 };

  it("accepts a well-formed request", () => {
    const out = validateAvailabilityRequest({ ...base, slots: ["SLOT_3", "SLOT_1"], requiredCapability: "LAB" });
    expect(out).toEqual({
      ok: true,
      request: { date: "2026-09-28", slots: ["SLOT_1", "SLOT_3"], partySize: 4, requiredCapability: "LAB" },
    });
  });

  it.each(["not-a-date", "2026-13-01", "2026-02-30", "2026-9-28", " 2026-09-28", "2026-09-28T00:00:00Z", 20260928])(
    "24. invalid date %j -> INVALID_DATE",
    (date) => {
      expect(validateAvailabilityRequest({ ...base, date })).toEqual({ ok: false, error: "INVALID_DATE" });
    }
  );

  it("25. empty slots -> NO_SLOTS", () => {
    expect(validateAvailabilityRequest({ ...base, slots: [] })).toEqual({ ok: false, error: "NO_SLOTS" });
  });

  it("26. duplicate slots -> DUPLICATE_SLOTS", () => {
    expect(validateAvailabilityRequest({ ...base, slots: ["SLOT_1", "SLOT_1"] })).toEqual({
      ok: false,
      error: "DUPLICATE_SLOTS",
    });
  });

  it.each([0, -1, 1.5, Number.NaN, "4", null])("27. partySize %j -> INVALID_PARTY_SIZE", (partySize) => {
    expect(validateAvailabilityRequest({ ...base, partySize })).toEqual({ ok: false, error: "INVALID_PARTY_SIZE" });
  });

  it("invalid AcademicSlot and RoomCapability values are rejected", () => {
    expect(validateAvailabilityRequest({ ...base, slots: ["SLOT_9"] })).toEqual({ ok: false, error: "INVALID_SLOT" });
    expect(validateAvailabilityRequest({ ...base, requiredCapability: "GYM" })).toEqual({
      ok: false,
      error: "INVALID_CAPABILITY",
    });
  });

  it("search filters: defaults applied only when omitted", () => {
    expect(validateRoomSearchFilters({})).toEqual({ ok: true, filters: { onlyAvailable: false, limit: 50 } });
  });

  it.each([
    [{ floor: 1.5 }, "INVALID_FLOOR"],
    [{ floor: "2" }, "INVALID_FLOOR"],
    [{ limit: 0 }, "INVALID_LIMIT"],
    [{ limit: 201 }, "INVALID_LIMIT"],
    [{ limit: 2.5 }, "INVALID_LIMIT"],
    [{ building: "" }, "INVALID_BUILDING"],
    [{ building: " A4" }, "INVALID_BUILDING"],
    [{ onlyAvailable: "yes" }, "INVALID_ONLY_AVAILABLE"],
  ])("search filters %j -> %s (rejected, not clamped)", (input, error) => {
    expect(validateRoomSearchFilters(input)).toEqual({ ok: false, error });
  });
});

describe("28. Asia/Bangkok", () => {
  it("an instant late on 28 Sep UTC is the 29 Sep calendar date, which hits the seeded closure", () => {
    // AvailabilityRequest.date is a calendar date, so the instant is converted first.
    const date = toAcademicDateString(new Date("2026-09-28T17:30:00Z"));
    expect(date).toBe("2026-09-29");

    const r = evaluateAvailability(context({ closures: [closure()] }), request({ date, slots: ["SLOT_3"] }));
    expect(r.status).toBe("CLOSED");
    expect(r.slots[0].closure?.id).toBe("demo-closure-lab01-slot3");
  });

  it("slot instants are Bangkok wall clock regardless of host timezone", () => {
    const r = evaluateAvailability(context(), request({ slots: ["SLOT_1", "SLOT_4"] }));
    expect(r.slots[0].startAt.toISOString()).toBe("2026-09-28T01:40:00.000Z"); // 08:40 ICT
    expect(r.slots[1].endAt.toISOString()).toBe("2026-09-28T12:20:00.000Z"); // 19:20 ICT
  });
});
