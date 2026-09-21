import { describe, expect, it } from "vitest";
import type { RoomAvailabilityResult, SlotAvailability } from "@/lib/availability";
import {
  buildBookingHandoffHref,
  compareFinderResults,
  emptyRoomFinderForm,
  getSlotRangeLabel,
  parseBookingHandoff,
  parseRoomFinderSearchParams,
  roomFinderHref,
  selectSlotRange,
  summarizeUnavailable,
  toBookingHandoff,
  toFinderCard,
  validateRoomFinderQuery,
  type RoomFinderQuery,
} from "@/lib/room-finder";
import { canUseRoomFinder } from "@/lib/permissions";
import type { AcademicSlot } from "@/lib/types";

// 2026-09-22 10:00 Bangkok (03:00Z): SLOT_1 (08:40-11:00) is in progress, nothing has ended.
const clock = { today: "2026-09-22", now: new Date("2026-09-22T03:00:00Z") };
const valid = { date: "2026-09-28", slots: ["SLOT_3"], partySize: "6" };

function errorOf(input: Record<string, unknown>, at = clock) {
  const out = validateRoomFinderQuery(input, at);
  return out.ok ? "OK" : out.error;
}

function result(patch: {
  code: string;
  available?: boolean;
  status?: RoomAvailabilityResult["status"];
  remaining?: number;
  capacity?: number;
  slots?: AcademicSlot[];
  slotDetails?: Partial<SlotAvailability>[];
  approval?: "AUTO" | "MANUAL";
  building?: string | null;
  floor?: number | null;
  capabilities?: RoomAvailabilityResult["room"]["capabilities"];
}): RoomAvailabilityResult {
  const capacity = patch.capacity ?? 40;
  const slots = patch.slots ?? ["SLOT_3"];
  return {
    room: {
      id: `id-${patch.code}`,
      roomCode: patch.code,
      name: `ห้อง ${patch.code}`,
      isActive: true,
      bookingEnabled: true,
      approvalPolicy: patch.approval ?? "AUTO",
      capabilities: patch.capabilities ?? ["LAB", "CLASSROOM"],
      capacity,
      building: patch.building === undefined ? "A4" : patch.building,
      floor: patch.floor === undefined ? 2 : patch.floor,
    },
    date: "2026-09-28",
    requestedSlots: slots,
    partySize: 6,
    available: patch.available ?? true,
    status: patch.status ?? "AVAILABLE",
    capacity,
    slots: (patch.slotDetails ?? slots.map(() => ({}))).map((detail, index) => ({
      slot: slots[index],
      startAt: new Date(0),
      endAt: new Date(0),
      available: true,
      status: "AVAILABLE",
      capacity,
      bookedCapacity: 0,
      remainingCapacity: capacity,
      pendingCapacity: 0,
      blockingClass: null,
      closure: null,
      ...detail,
    })) as SlotAvailability[],
    remainingCapacity: patch.remaining ?? capacity,
    requiresApproval: (patch.approval ?? "AUTO") === "MANUAL",
    configWarnings: [],
  };
}

describe("1/2. who gets the finder", () => {
  it("STUDENT, ADMIN and SUPER_ADMIN yes; GUEST no", () => {
    expect(canUseRoomFinder("STUDENT")).toBe(true);
    expect(canUseRoomFinder("ADMIN")).toBe(true);
    expect(canUseRoomFinder("SUPER_ADMIN")).toBe(true);
    expect(canUseRoomFinder("GUEST")).toBe(false);
  });
});

describe("4. party size", () => {
  it.each(["1", "6", "10000", 6])("accepts %j", (partySize) => expect(errorOf({ ...valid, partySize })).toBe("OK"));
  it.each(["0", "-1", "1.5", "abc", "", " 6", "10001", 0, 1.5, null, undefined])("rejects %j", (partySize) =>
    expect(errorOf({ ...valid, partySize })).toBe("INVALID_PARTY_SIZE")
  );
});

describe("5. date and horizon", () => {
  it("accepts today and today+30", () => {
    expect(errorOf({ ...valid, date: "2026-09-22", slots: ["SLOT_2"] })).toBe("OK");
    expect(errorOf({ ...valid, date: "2026-10-22" })).toBe("OK");
  });
  it.each(["2026-09-21", "2026-10-23", "2027-01-01"])("rejects %s as out of range", (date) =>
    expect(errorOf({ ...valid, date })).toBe("DATE_OUT_OF_RANGE")
  );
  it.each(["2026-02-30", "2026-13-01", "28/09/2026", "", undefined])("rejects %j as invalid", (date) =>
    expect(errorOf({ ...valid, date })).toBe("INVALID_DATE")
  );
  it("uses the Bangkok date: 23:30 Bangkok on the 22nd is still the 22nd", () => {
    const lateNight = { today: "2026-09-22", now: new Date("2026-09-22T16:30:00Z") };
    expect(errorOf({ ...valid, date: "2026-09-22", slots: ["SLOT_4"] }, lateNight)).toBe("SLOT_ENDED");
    expect(errorOf({ ...valid, date: "2026-09-23", slots: ["SLOT_1"] }, lateNight)).toBe("OK");
  });
});

describe("6/16. slots", () => {
  it("accepts one slot or a contiguous run, stored in slot order", () => {
    const out = validateRoomFinderQuery({ ...valid, slots: ["SLOT_3", "SLOT_2"] }, clock);
    expect(out.ok && out.query.slots).toEqual(["SLOT_2", "SLOT_3"]);
  });
  it.each([
    [[], "NO_SLOTS"],
    [undefined, "NO_SLOTS"],
    [["SLOT_9"], "INVALID_SLOT"],
    [["SLOT_1", "SLOT_3"], "SLOTS_NOT_CONTIGUOUS"],
    [["SLOT_2", "SLOT_2"], "SLOTS_NOT_CONTIGUOUS"],
  ])("%j -> %s", (slots, error) => expect(errorOf({ ...valid, slots })).toBe(error));

  it("rejects a slot that has already ended today, but not one in progress", () => {
    const afternoon = { today: "2026-09-22", now: new Date("2026-09-22T08:00:00Z") }; // 15:00 Bangkok
    expect(errorOf({ ...valid, date: "2026-09-22", slots: ["SLOT_2", "SLOT_3"] }, afternoon)).toBe("SLOT_ENDED");
    expect(errorOf({ ...valid, date: "2026-09-22", slots: ["SLOT_3"] }, afternoon)).toBe("OK");
    expect(errorOf({ ...valid, date: "2026-09-23", slots: ["SLOT_1"] }, afternoon)).toBe("OK");
  });

  describe("selectSlotRange", () => {
    it("first tap selects one slot", () => expect(selectSlotRange([], "SLOT_2")).toEqual(["SLOT_2"]));
    it("a second tap fills the range, including the gap", () =>
      expect(selectSlotRange(["SLOT_1"], "SLOT_3")).toEqual(["SLOT_1", "SLOT_2", "SLOT_3"]));
    it("works backwards too", () => expect(selectSlotRange(["SLOT_4"], "SLOT_2")).toEqual(["SLOT_2", "SLOT_3", "SLOT_4"]));
    it("extends an existing range", () =>
      expect(selectSlotRange(["SLOT_2", "SLOT_3"], "SLOT_4")).toEqual(["SLOT_2", "SLOT_3", "SLOT_4"]));
    it("a tap inside the range resets to that slot", () =>
      expect(selectSlotRange(["SLOT_1", "SLOT_2", "SLOT_3"], "SLOT_2")).toEqual(["SLOT_2"]));
    it("tapping the only selected slot clears it", () => expect(selectSlotRange(["SLOT_2"], "SLOT_2")).toEqual([]));
    it("never produces a gap", () => {
      const all: AcademicSlot[] = ["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"];
      for (const a of all) for (const b of all) {
        const out = selectSlotRange([a], b);
        if (out.length > 0) expect(errorOf({ ...valid, slots: out })).toBe("OK");
      }
    });
  });

  it("labels come from academic-slots", () => {
    expect(getSlotRangeLabel(["SLOT_3"])).toBe("คาบ 3 · 14:30–16:50");
    expect(getSlotRangeLabel(["SLOT_3", "SLOT_2"])).toBe("คาบ 2–3 · 12:00–16:50");
  });
});

describe("7/8. capability, building, floor", () => {
  it("capability is optional (ทุกประเภท)", () => {
    const out = validateRoomFinderQuery({ ...valid, capability: "" }, clock);
    expect(out.ok && out.query.capability).toBeNull();
  });
  it("accepts a real capability and rejects others", () => {
    expect(errorOf({ ...valid, capability: "LAB" })).toBe("OK");
    expect(errorOf({ ...valid, capability: "GYM" })).toBe("INVALID_CAPABILITY");
  });
  it("building and floor are optional; floor needs a building", () => {
    const out = validateRoomFinderQuery({ ...valid, building: "A4", floor: "4" }, clock);
    expect(out.ok && out.query).toMatchObject({ building: "A4", floor: 4 });
    expect(errorOf({ ...valid, floor: "4" })).toBe("INVALID_FLOOR");
    expect(errorOf({ ...valid, building: "A4", floor: "x" })).toBe("INVALID_FLOOR");
    expect(errorOf({ ...valid, building: " A4" })).toBe("INVALID_BUILDING");
  });
});

describe("15. URL state", () => {
  const query: RoomFinderQuery = {
    date: "2026-09-28",
    slots: ["SLOT_2", "SLOT_3"],
    partySize: 6,
    capability: "LAB",
    building: "A4",
    floor: 4,
  };

  it("builds the documented URL", () => {
    expect(roomFinderHref(query)).toBe(
      "/rooms?date=2026-09-28&slots=SLOT_2%2CSLOT_3&partySize=6&capability=LAB&building=A4&floor=4"
    );
  });

  it("round-trips through the URL", () => {
    const params = Object.fromEntries(new URL(roomFinderHref(query), "http://x").searchParams);
    const parsed = parseRoomFinderSearchParams(params, clock);
    expect(parsed.submitted).toBe(true);
    expect(parsed.outcome).toEqual({ ok: true, query });
  });

  it("omits optional filters when unset", () => {
    expect(roomFinderHref({ ...query, capability: null, building: null, floor: null })).toBe(
      "/rooms?date=2026-09-28&slots=SLOT_2%2CSLOT_3&partySize=6"
    );
  });

  it("the dashboard card's ?partySize=6 pre-fills without searching; defaults are today and no slot", () => {
    const parsed = parseRoomFinderSearchParams({ partySize: "6" }, clock);
    expect(parsed).toEqual({
      form: { date: "2026-09-22", slots: [], partySize: "6", capability: "", building: "", floor: "" },
      submitted: false,
      outcome: null,
    });
  });

  it("an empty URL does not search (no default listing of rooms)", () => {
    expect(parseRoomFinderSearchParams({}, clock).outcome).toBeNull();
  });

  it("an invalid submitted URL reports the error and keeps what it can for the form", () => {
    const parsed = parseRoomFinderSearchParams({ date: "2026-09-28", slots: "SLOT_1,SLOT_3", partySize: "6" }, clock);
    expect(parsed.outcome).toEqual({ ok: false, error: "SLOTS_NOT_CONTIGUOUS" });
    expect(parsed.form.slots).toEqual(["SLOT_1", "SLOT_3"]);
  });

  it("ignores repeated params instead of guessing", () => {
    const parsed = parseRoomFinderSearchParams({ date: "2026-09-28", slots: ["SLOT_1", "SLOT_2"], partySize: "6" }, clock);
    expect(parsed.submitted).toBe(false);
  });
});

describe("ordering: tightest fit on actual availability", () => {
  it("prefers 7 seats left over 30 for a party of 6, then the smaller room, then roomCode", () => {
    const rooms = [
      result({ code: "A-BIG", remaining: 30, capacity: 30 }),
      result({ code: "Z-TIGHT", remaining: 7, capacity: 10 }),
      result({ code: "M-12", remaining: 8, capacity: 12 }),
      result({ code: "N-8", remaining: 8, capacity: 8 }),
      result({ code: "B-8", remaining: 8, capacity: 8 }),
      result({ code: "C-CLASS", available: false, status: "CLASS_IN_SESSION", remaining: 40 }),
      result({ code: "0-FULL", available: false, status: "FULL", remaining: 3 }),
    ];
    expect([...rooms].sort(compareFinderResults).map((r) => r.room.roomCode)).toEqual([
      "Z-TIGHT",
      "B-8",
      "N-8",
      "M-12",
      "A-BIG",
      "0-FULL",
      "C-CLASS",
    ]);
  });
});

describe("9-12. result cards", () => {
  it("renders an available AUTO room with Thai labels only", () => {
    const card = toFinderCard(result({ code: "LAB-01", remaining: 12, capacity: 40 }));
    expect(card).toMatchObject({
      roomCode: "LAB-01",
      name: "ห้อง LAB-01",
      capabilityLabels: ["ห้องปฏิบัติการ", "ห้องเรียน"],
      locationLabel: "อาคาร A4 · ชั้น 2",
      capacityLabel: "รองรับ 40 คน",
      remainingLabel: "เหลือ 12 ที่",
      available: true,
      statusLabel: "พร้อมใช้งาน",
      approvalLabel: "อนุมัติอัตโนมัติ",
      requiresApproval: false,
      slotIssues: [],
    });
    expect(JSON.stringify(card)).not.toMatch(/\b(LAB|CLASSROOM|AVAILABLE|AUTO|MANUAL)\b(?!-)/);
  });

  it("MANUAL rooms say approval is required", () => {
    const card = toFinderCard(result({ code: "MEET", approval: "MANUAL" }));
    expect(card.approvalLabel).toBe("ต้องได้รับการอนุมัติจากผู้ดูแลระบบ");
    expect(card.requiresApproval).toBe(true);
  });

  it("multi-slot remaining capacity is for the whole run", () => {
    const card = toFinderCard(result({ code: "X", slots: ["SLOT_2", "SLOT_3"], remaining: 5 }));
    expect(card.remainingLabel).toBe("เหลือ 5 ที่ ตลอดช่วงที่เลือก");
  });

  it("an unavailable multi-slot room lists which slot failed and why", () => {
    const card = toFinderCard(
      result({
        code: "X",
        available: false,
        status: "CLASS_IN_SESSION",
        slots: ["SLOT_2", "SLOT_3"],
        slotDetails: [{}, { available: false, status: "CLASS_IN_SESSION" }],
      })
    );
    expect(card.statusLabel).toBe("กำลังมีการเรียน");
    expect(card.remainingLabel).toBeNull();
    expect(card.slotIssues).toEqual(["คาบ 3: กำลังมีการเรียน"]);
  });

  it("FULL keeps its remaining seats and never says anything but ห้องเต็ม", () => {
    const card = toFinderCard(result({ code: "X", available: false, status: "FULL", remaining: 3 }));
    expect(card.statusLabel).toBe("ห้องเต็ม");
    expect(card.remainingLabel).toBe("เหลือ 3 ที่");
  });

  it("location falls back gracefully", () => {
    expect(toFinderCard(result({ code: "X", building: null, floor: null })).locationLabel).toBeNull();
    expect(toFinderCard(result({ code: "X", building: "A4", floor: null })).locationLabel).toBe("อาคาร A4");
  });
});

describe("13. unavailable summary", () => {
  it("uses Feature 3 labels, skips AVAILABLE and zero counts", () => {
    expect(summarizeUnavailable({ AVAILABLE: 4, FULL: 2, CLASS_IN_SESSION: 3, CLOSED: 0 })).toEqual([
      { status: "CLASS_IN_SESSION", label: "กำลังมีการเรียน", count: 3 },
      { status: "FULL", label: "ห้องเต็ม", count: 2 },
    ]);
  });
});

describe("Feature 7 hand-off", () => {
  const query: RoomFinderQuery = {
    date: "2026-09-28",
    slots: ["SLOT_2", "SLOT_3"],
    partySize: 6,
    capability: "LAB",
    building: "A4",
    floor: 4,
  };

  it("carries only roomId, date, slots, partySize and capability", () => {
    expect(toBookingHandoff("room-1", query)).toEqual({
      roomId: "room-1",
      date: "2026-09-28",
      slots: ["SLOT_2", "SLOT_3"],
      partySize: 6,
      requiredCapability: "LAB",
    });
    expect(toBookingHandoff("room-1", { ...query, capability: null })).not.toHaveProperty("requiredCapability");
  });

  it("round-trips through the booking URL and is re-validated", () => {
    const handoff = toBookingHandoff("room-1", query);
    const url = new URL(buildBookingHandoffHref(handoff), "http://x");
    expect(url.pathname).toBe("/rooms/room-1/book");
    expect(parseBookingHandoff("room-1", Object.fromEntries(url.searchParams), clock)).toEqual({ ok: true, handoff });
    expect(parseBookingHandoff("room-1", { date: "2026-09-28", slots: "SLOT_1,SLOT_3", partySize: "6" }, clock)).toEqual({
      ok: false,
      error: "SLOTS_NOT_CONTIGUOUS",
    });
    expect(parseBookingHandoff("", {}, clock)).toEqual({ ok: false, error: "INVALID_ROOM" });
  });
});

describe("dashboard expansion", () => {
  it("starts the full finder on today, no slot, with the party size carried over", () => {
    expect(emptyRoomFinderForm("2026-09-22", "6")).toEqual({
      date: "2026-09-22",
      slots: [],
      partySize: "6",
      capability: "",
      building: "",
      floor: "",
    });
  });

  it("a fresh form is not a valid search until a slot is chosen", () => {
    expect(errorOf({ ...emptyRoomFinderForm("2026-09-22", "6") })).toBe("NO_SLOTS");
  });
});
