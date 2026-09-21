import { describe, expect, it } from "vitest";
import {
  applyRoomListChange,
  buildRoomListWhere,
  deriveRoomConfigurationHealth,
  evaluateRoomDeletion,
  NEW_ROOM_DEFAULTS,
  parseRoomListSearchParams,
  roomListQueryString,
  validateAvailabilityWindows,
  validateRoomClosure,
  validateRoomConfiguration,
  validateRoomListFilters,
} from "@/lib/room-config";

const VALID_ROOM = {
  name: "ห้อง Lab",
  roomCode: "LAB-01",
  description: "",
  building: "",
  floor: null,
  capacity: 15,
  capabilities: ["LAB", "CLASSROOM"],
  isActive: true,
  bookingEnabled: true,
  approvalPolicy: "AUTO",
  guestAccess: false,
  staffOnly: false,
};

describe("room configuration validation", () => {
  it("2. capabilities are multi-select, stored in canonical order", () => {
    const out = validateRoomConfiguration({ ...VALID_ROOM, capabilities: ["EVENT", "LAB", "MEETING"] });
    expect(out.ok && out.value.capabilities).toEqual(["LAB", "MEETING", "EVENT"]);
  });

  it("3. empty capabilities is valid (configuration incomplete, not an error)", () => {
    const out = validateRoomConfiguration({ ...VALID_ROOM, capabilities: [] });
    expect(out.ok && out.value.capabilities).toEqual([]);
  });

  it("4. capacity 0 is valid (configuration incomplete, not an error)", () => {
    const out = validateRoomConfiguration({ ...VALID_ROOM, capacity: 0 });
    expect(out.ok && out.value.capacity).toBe(0);
  });

  it("blank optional text becomes null; nothing is inferred from roomCode", () => {
    const out = validateRoomConfiguration({ ...VALID_ROOM, roomCode: "A4-404", building: "  ", description: "" });
    expect(out.ok && out.value).toMatchObject({ building: null, description: null, floor: null });
  });

  it("new-room defaults are operational but not bookable, with no capabilities", () => {
    const out = validateRoomConfiguration({ ...NEW_ROOM_DEFAULTS, name: "ใหม่", roomCode: "NEW-1", capacity: 0 });
    expect(out.ok && out.value).toMatchObject({ isActive: true, bookingEnabled: false, capabilities: [] });
  });

  it.each([
    [{ name: "  " }, "INVALID_NAME"],
    [{ roomCode: "a4-404" }, "INVALID_ROOM_CODE"],
    [{ roomCode: "A4 404" }, "INVALID_ROOM_CODE"],
    [{ roomCode: "-A4" }, "INVALID_ROOM_CODE"],
    [{ floor: 1.5 }, "INVALID_FLOOR"],
    [{ floor: "3" }, "INVALID_FLOOR"],
    [{ capacity: -1 }, "INVALID_CAPACITY"],
    [{ capacity: 2.5 }, "INVALID_CAPACITY"],
    [{ capacity: "15" }, "INVALID_CAPACITY"],
    [{ capabilities: ["GYM"] }, "INVALID_CAPABILITIES"],
    [{ capabilities: "LAB" }, "INVALID_CAPABILITIES"],
    [{ capabilities: ["LAB", "LAB"] }, "DUPLICATE_CAPABILITIES"],
    [{ bookingEnabled: "true" }, "INVALID_FLAG"],
    [{ staffOnly: undefined }, "INVALID_FLAG"],
    [{ approvalPolicy: "AUTOMATIC" }, "INVALID_APPROVAL_POLICY"],
  ])("rejects %j -> %s", (patch, error) => {
    expect(validateRoomConfiguration({ ...VALID_ROOM, ...patch })).toEqual({ ok: false, error });
  });
});

describe("17. configuration health derivation", () => {
  const ready = { isActive: true, bookingEnabled: true, capabilities: ["LAB" as const], capacity: 15, availabilityWindowCount: 20 };

  it("READY needs active + booking + capability + capacity + a window", () => {
    expect(deriveRoomConfigurationHealth(ready)).toEqual({ health: "READY", issues: [] });
  });

  it("INACTIVE takes precedence over everything", () => {
    expect(deriveRoomConfigurationHealth({ ...ready, isActive: false, capacity: 0 }).health).toBe("INACTIVE");
  });

  it("5. bookingEnabled=false does not require windows, capabilities or capacity", () => {
    expect(
      deriveRoomConfigurationHealth({ ...ready, bookingEnabled: false, capabilities: [], capacity: 0, availabilityWindowCount: 0 })
    ).toEqual({ health: "BOOKING_DISABLED", issues: [] });
  });

  it("6. bookingEnabled=true with no windows is INCOMPLETE", () => {
    expect(deriveRoomConfigurationHealth({ ...ready, availabilityWindowCount: 0 })).toEqual({
      health: "INCOMPLETE",
      issues: ["MISSING_WINDOWS"],
    });
  });

  it("3/4. empty capabilities and capacity 0 are INCOMPLETE, with every issue listed", () => {
    expect(
      deriveRoomConfigurationHealth({ ...ready, capabilities: [], capacity: 0, availabilityWindowCount: 0 })
    ).toEqual({ health: "INCOMPLETE", issues: ["MISSING_CAPABILITIES", "MISSING_CAPACITY", "MISSING_WINDOWS"] });
  });
});

describe("availability window validation", () => {
  it("empty set is valid and means no ad-hoc availability", () => {
    expect(validateAvailabilityWindows([])).toEqual({ ok: true, value: [] });
  });

  it("output order is deterministic regardless of input order", () => {
    const out = validateAvailabilityWindows([
      { dayOfWeek: 5, slot: "SLOT_2" },
      { dayOfWeek: 1, slot: "SLOT_4" },
      { dayOfWeek: 1, slot: "SLOT_1" },
    ]);
    expect(out).toEqual({
      ok: true,
      value: [
        { dayOfWeek: 1, slot: "SLOT_1" },
        { dayOfWeek: 1, slot: "SLOT_4" },
        { dayOfWeek: 5, slot: "SLOT_2" },
      ],
    });
  });

  it.each([
    ["not-array", "INVALID_WINDOWS"],
    [[{ dayOfWeek: 7, slot: "SLOT_1" }], "INVALID_DAY"],
    [[{ dayOfWeek: -1, slot: "SLOT_1" }], "INVALID_DAY"],
    [[{ dayOfWeek: 1.5, slot: "SLOT_1" }], "INVALID_DAY"],
    [[{ dayOfWeek: 1, slot: "SLOT_5" }], "INVALID_SLOT"],
    [[{ dayOfWeek: 1, slot: "SLOT_1" }, { dayOfWeek: 1, slot: "SLOT_1" }], "DUPLICATE_WINDOW"],
    [[null], "INVALID_WINDOWS"],
  ])("rejects %j -> %s", (input, error) => {
    expect(validateAvailabilityWindows(input)).toEqual({ ok: false, error });
  });
});

describe("closure validation", () => {
  const today = "2026-09-22";
  const base = { startDate: "2026-09-29", endDate: "2026-09-29", slots: [], reason: "" };

  it("10. whole range: slots=[] is valid", () => {
    expect(validateRoomClosure(base, today)).toEqual({ ok: true, value: { ...base, reason: null } });
  });

  it("11. slot-specific closure, slots sorted deterministically", () => {
    const out = validateRoomClosure({ ...base, slots: ["SLOT_3", "SLOT_2"], reason: " ซ่อมแอร์ " }, today);
    expect(out.ok && out.value).toMatchObject({ slots: ["SLOT_2", "SLOT_3"], reason: "ซ่อมแอร์" });
  });

  it("a range that includes today is valid; inclusive single day is valid", () => {
    expect(validateRoomClosure({ ...base, startDate: "2026-09-20", endDate: today }, today).ok).toBe(true);
  });

  it.each([
    [{ startDate: "2026-02-30" }, "INVALID_START_DATE"],
    [{ startDate: "29/09/2026" }, "INVALID_START_DATE"],
    [{ endDate: "2026-13-01" }, "INVALID_END_DATE"],
    [{ startDate: "2026-10-01", endDate: "2026-09-30" }, "END_BEFORE_START"],
    [{ startDate: "2026-09-01", endDate: "2026-09-21" }, "END_IN_PAST"],
    [{ slots: ["SLOT_9"] }, "INVALID_SLOT"],
    [{ slots: "SLOT_1" }, "INVALID_SLOT"],
    [{ reason: "x".repeat(201) }, "INVALID_REASON"],
  ])("12. rejects %j -> %s", (patch, error) => {
    expect(validateRoomClosure({ ...base, ...patch }, today)).toEqual({ ok: false, error });
  });

  it("13. duplicate slots are rejected, not silently de-duplicated", () => {
    expect(validateRoomClosure({ ...base, slots: ["SLOT_2", "SLOT_2"] }, today)).toEqual({ ok: false, error: "DUPLICATE_SLOTS" });
  });
});

describe("deletion decision", () => {
  const none = { bookings: 0, sessions: 0, accessTokens: 0, classSchedules: 0, logs: 0, agentMachines: 0 };

  it("an unused room may be deleted", () => {
    expect(evaluateRoomDeletion(none)).toEqual({ allowed: true, blockers: [] });
  });

  it.each(["bookings", "sessions", "accessTokens", "classSchedules", "logs", "agentMachines"] as const)(
    "14/15. any %s history blocks deletion",
    (kind) => {
      expect(evaluateRoomDeletion({ ...none, [kind]: 2 })).toEqual({ allowed: false, blockers: [{ kind, count: 2 }] });
    }
  );
});

describe("18a. list page size", () => {
  const sizeOf = (input: Record<string, unknown>) => {
    const out = validateRoomListFilters(input);
    return out.ok ? out.value.pageSize : out.error;
  };

  it("defaults to 25", () => expect(sizeOf({})).toBe(25));
  it("accepts 10", () => expect(sizeOf({ pageSize: 10 })).toBe(10));
  it("accepts 50", () => expect(sizeOf({ pageSize: 50 })).toBe(50));

  it.each([[20], [404], [0], [-10], [10.5], ["10"], [null], [Number.NaN]])(
    "falls back to 25 for an unsupported size %j",
    (pageSize) => expect(sizeOf({ pageSize })).toBe(25)
  );

  it("changing page size resets to page 1 and keeps search/filters", () => {
    const current = { q: "A4", building: "A4", capability: "LAB", booking: "ENABLED", health: "READY", page: 7, pageSize: 25 };
    expect(applyRoomListChange(current, { pageSize: 10 })).toEqual({ ...current, page: 1, pageSize: 10 });
  });

  it("a filter change resets to page 1; a page change keeps the size", () => {
    const current = { q: "", building: "", page: 3, pageSize: 50 };
    expect(applyRoomListChange(current, { building: "A4" })).toEqual({ q: "", building: "A4", page: 1, pageSize: 50 });
    expect(applyRoomListChange(current, { page: 4 })).toEqual({ ...current, page: 4 });
  });

  it("two changes in one tick compose (page size then page 1) instead of reverting the size", () => {
    // TablePagination fires onPageSizeChange(10) then onPageChange(1) synchronously.
    const afterSize = applyRoomListChange({ q: "LAB", page: 5, pageSize: 25 }, { pageSize: 10 });
    const afterPage = applyRoomListChange(afterSize, { page: 1 });
    expect(afterPage).toEqual({ q: "LAB", page: 1, pageSize: 10 });
  });
});

describe("18b. list state in the URL", () => {
  it("reads page and pageSize from the query string", () => {
    const raw = parseRoomListSearchParams({ page: "2", pageSize: "50" });
    const out = validateRoomListFilters(raw);
    expect(out.ok && out.value).toMatchObject({ page: 2, pageSize: 50 });
  });

  it("missing or invalid pageSize in the URL falls back to 25", () => {
    for (const pageSize of [undefined, "", "abc", "20", "404", "-10", ["10", "50"]]) {
      const out = validateRoomListFilters(parseRoomListSearchParams({ pageSize }));
      expect(out.ok && out.value.pageSize).toBe(25);
    }
  });

  it("drops a malformed page or filter instead of failing the page", () => {
    const raw = parseRoomListSearchParams({ page: "0", health: "BROKEN", capability: "GYM", booking: "MAYBE" });
    const out = validateRoomListFilters(raw);
    expect(out.ok && out.value).toMatchObject({ page: 1, health: "ALL", capability: null, booking: "ALL" });
  });

  it("keeps search and filters from the URL", () => {
    const raw = parseRoomListSearchParams({
      q: "A4-2",
      building: "A4",
      capability: "LAB",
      operational: "ACTIVE",
      booking: "ENABLED",
      health: "INCOMPLETE",
      page: "3",
      pageSize: "10",
    });
    const out = validateRoomListFilters(raw);
    expect(out.ok && out.value).toEqual({
      q: "A4-2",
      building: "A4",
      capability: "LAB",
      operational: "ACTIVE",
      booking: "ENABLED",
      health: "INCOMPLETE",
      page: 3,
      pageSize: 10,
    });
  });

  it("writes page and pageSize always, and other filters only when set", () => {
    expect(roomListQueryString({ q: "", building: "", operational: "ALL", booking: "ALL", health: "ALL", page: 1, pageSize: 10 })).toBe(
      "page=1&pageSize=10"
    );
    expect(
      roomListQueryString({ q: " lab ", building: "A4", capability: "LAB", health: "READY", page: 2, pageSize: 50 })
    ).toBe("q=lab&building=A4&capability=LAB&health=READY&page=2&pageSize=50");
  });

  it("round-trips through the URL", () => {
    const state = { q: "MEET", building: "__NONE__", capability: "MEETING", operational: "ACTIVE", booking: "DISABLED", health: "BOOKING_DISABLED", page: 4, pageSize: 50 };
    const parsed = parseRoomListSearchParams(Object.fromEntries(new URLSearchParams(roomListQueryString(state))));
    expect(parsed).toEqual(state);
  });
});

describe("18. list filters are bounded and strict", () => {
  it("defaults to page 1, 25 per page", () => {
    const out = validateRoomListFilters({});
    expect(out.ok && out.value).toMatchObject({ page: 1, pageSize: 25, operational: "ALL", booking: "ALL", health: "ALL" });
  });

  it.each([
    [{ page: 0 }, "INVALID_PAGE"],
    [{ page: 1.5 }, "INVALID_PAGE"],
    [{ capability: "GYM" }, "INVALID_CAPABILITY"],
    [{ operational: "YES" }, "INVALID_OPERATIONAL"],
    [{ booking: "MAYBE" }, "INVALID_BOOKING"],
    [{ health: "BROKEN" }, "INVALID_HEALTH"],
    [{ q: "x".repeat(101) }, "INVALID_QUERY"],
  ])("rejects %j -> %s", (input, error) => {
    expect(validateRoomListFilters(input)).toEqual({ ok: false, error });
  });

  it("combines search and health with AND so their ORs cannot collide", () => {
    const out = validateRoomListFilters({ q: "A4", health: "INCOMPLETE", booking: "ENABLED" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const where = buildRoomListWhere(out.value);
    expect(Object.keys(where)).toEqual(["AND"]);
    expect(where.AND).toHaveLength(3);
  });

  it("no filters -> no where clause", () => {
    const out = validateRoomListFilters({});
    expect(out.ok && buildRoomListWhere(out.value)).toEqual({});
  });
});
