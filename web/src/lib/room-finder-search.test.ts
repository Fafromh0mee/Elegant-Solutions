import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomAvailabilityResult } from "@/lib/availability";

// The /rooms loader with the Feature 3 data layer mocked: proves what reaches the
// engine, and how each outcome becomes a page state. No database.

const data = vi.hoisted(() => ({
  searchRoomAvailability: vi.fn(),
  searchRoomDayAvailability: vi.fn(),
  countBookableRoomsWithCapability: vi.fn(),
  listBookableLocations: vi.fn(),
}));
vi.mock("@/lib/availability-context", () => data);

const { loadDashboardRoomFinder, loadRoomFinder } = await import("@/lib/room-finder-search");
const { compareDayResults, compareFinderResults } = await import("@/lib/room-finder");

// 2026-09-22 10:00 Bangkok.
const now = new Date("2026-09-22T03:00:00Z");
const search = { date: "2026-09-28", slots: "SLOT_2,SLOT_3", partySize: "6" };
const STUDENT = { role: "STUDENT", status: "APPROVED" } as const;
const PENDING_GUEST = { role: "GUEST", status: "PENDING" } as const;

function room(code: string, available: boolean, remaining = 10): RoomAvailabilityResult {
  return {
    room: {
      id: code,
      roomCode: code,
      name: code,
      isActive: true,
      bookingEnabled: true,
      approvalPolicy: "AUTO",
      capabilities: ["LAB"],
      capacity: 20,
      building: "A4",
      floor: 2,
    },
    date: "2026-09-28",
    requestedSlots: ["SLOT_2", "SLOT_3"],
    partySize: 6,
    available,
    status: available ? "AVAILABLE" : "CLASS_IN_SESSION",
    capacity: 20,
    slots: [],
    remainingCapacity: remaining,
    requiresApproval: false,
    configWarnings: [],
  };
}

function outcome(results: RoomAvailabilityResult[], extra: Record<string, unknown> = {}) {
  const statusCounts: Record<string, number> = {};
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  return { results, truncated: false, candidatesTruncated: false, statusCounts, ...extra };
}

beforeEach(() => {
  data.searchRoomAvailability.mockReset();
  data.searchRoomDayAvailability.mockReset();
  data.countBookableRoomsWithCapability.mockReset();
  data.listBookableLocations.mockReset().mockResolvedValue([{ building: "A4", floor: 2 }]);
});

describe("1/2. access", () => {
  it("no session -> UNAUTHENTICATED (page redirects to /login), nothing queried", async () => {
    expect(await loadRoomFinder({ viewer: null, params: search, now })).toEqual({ kind: "UNAUTHENTICATED" });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
  });

  it("pending GUEST -> NOT_ALLOWED, nothing queried", async () => {
    expect(await loadRoomFinder({ viewer: PENDING_GUEST, params: search, now })).toEqual({ kind: "NOT_ALLOWED" });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
    expect(data.listBookableLocations).not.toHaveBeenCalled();
  });

  it.each(["STUDENT", "ADMIN", "SUPER_ADMIN"] as const)("%s can use the finder", async (role) => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    const state = await loadRoomFinder({ viewer: { role, status: "APPROVED" }, params: search, now });
    expect(state.kind).toBe("READY");
  });
});

describe("3. what reaches the Feature 3 engine", () => {
  it("passes the validated request, filters, limit and the tightest-fit order", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    await loadRoomFinder({
      viewer: STUDENT,
      params: { ...search, capability: "LAB", building: "A4", floor: "2" },
      now,
    });
    expect(data.searchRoomAvailability).toHaveBeenCalledTimes(1);
    expect(data.searchRoomAvailability).toHaveBeenCalledWith(
      { date: "2026-09-28", slots: ["SLOT_2", "SLOT_3"], partySize: 6, requiredCapability: "LAB" },
      { building: "A4", floor: 2, onlyAvailable: false, limit: 50 },
      { compare: compareFinderResults, audience: "ALL" }
    );
  });

  it("ทุกประเภท sends no capability and no location filters", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    await loadRoomFinder({ viewer: STUDENT, params: search, now });
    const [request, filters] = data.searchRoomAvailability.mock.calls[0];
    expect(request.requiredCapability).toBeUndefined();
    expect(filters).toEqual({ building: undefined, floor: undefined, onlyAvailable: false, limit: 50 });
  });

  it("does not search at all without a submitted request", async () => {
    const state = await loadRoomFinder({ viewer: STUDENT, params: { partySize: "6" }, now });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
    expect(state).toMatchObject({ kind: "READY", search: null, today: "2026-09-22", maxDate: "2026-10-22" });
  });

  it("invalid input never reaches the engine", async () => {
    const state = await loadRoomFinder({ viewer: STUDENT, params: { ...search, partySize: "0" }, now });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
    expect(state).toMatchObject({ search: { kind: "INVALID", error: "INVALID_PARTY_SIZE" } });
  });
});

describe("results", () => {
  it("splits available from unavailable", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([room("A", true), room("B", false)]));
    const state = await loadRoomFinder({ viewer: STUDENT, params: search, now });
    expect(state).toMatchObject({
      search: { kind: "DONE", availableTruncated: false, capabilityHasNoRooms: false },
    });
    if (state.kind !== "READY" || state.search?.kind !== "DONE") throw new Error("expected results");
    expect(state.search.available.map((r) => r.room.id)).toEqual(["A"]);
    expect(state.search.unavailable.map((r) => r.room.id)).toEqual(["B"]);
  });

  it("18. flags truncation when more rooms are available than shown", async () => {
    data.searchRoomAvailability.mockResolvedValue(
      outcome([room("A", true)], { statusCounts: { AVAILABLE: 60 }, truncated: true })
    );
    const state = await loadRoomFinder({ viewer: STUDENT, params: search, now });
    expect(state).toMatchObject({ search: { availableTruncated: true } });
  });

  it("18. flags truncation when the candidate cap was hit", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([room("A", true)], { candidatesTruncated: true }));
    const state = await loadRoomFinder({ viewer: STUDENT, params: search, now });
    expect(state).toMatchObject({ search: { availableTruncated: true } });
  });

  it("does not flag truncation when only unavailable rooms were cut", async () => {
    data.searchRoomAvailability.mockResolvedValue(
      outcome([room("A", true)], { statusCounts: { AVAILABLE: 1, CLASS_IN_SESSION: 80 }, truncated: true })
    );
    const state = await loadRoomFinder({ viewer: STUDENT, params: search, now });
    expect(state).toMatchObject({ search: { availableTruncated: false } });
  });
});

describe("13. empty states", () => {
  it("generic by default: no capability -> no proof query", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    const state = await loadRoomFinder({ viewer: STUDENT, params: search, now });
    expect(data.countBookableRoomsWithCapability).not.toHaveBeenCalled();
    expect(state).toMatchObject({ search: { capabilityHasNoRooms: false } });
  });

  it("capability-specific only when the count proves zero rooms exist", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    data.countBookableRoomsWithCapability.mockResolvedValue(0);
    const state = await loadRoomFinder({ viewer: STUDENT, params: { ...search, capability: "EVENT" }, now });
    expect(data.countBookableRoomsWithCapability).toHaveBeenCalledWith("EVENT", "ALL");
    expect(state).toMatchObject({ search: { capabilityHasNoRooms: true } });
  });

  it("stays generic when rooms of that capability exist (e.g. just too small or busy)", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    data.countBookableRoomsWithCapability.mockResolvedValue(2);
    const state = await loadRoomFinder({ viewer: STUDENT, params: { ...search, capability: "LAB" }, now });
    expect(state).toMatchObject({ search: { capabilityHasNoRooms: false } });
  });

  it("never runs the proof query when rooms were found", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([room("A", true)]));
    await loadRoomFinder({ viewer: STUDENT, params: { ...search, capability: "LAB" }, now });
    expect(data.countBookableRoomsWithCapability).not.toHaveBeenCalled();
  });
});

describe("14. backend errors", () => {
  it("a failed search becomes FAILED, never an exception or internal code", async () => {
    data.searchRoomAvailability.mockRejectedValue(new Error("connection refused"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await loadRoomFinder({ viewer: STUDENT, params: search, now });
    expect(state).toMatchObject({ kind: "READY", search: { kind: "FAILED" } });
    spy.mockRestore();
  });

  it("a failed location lookup still renders the finder", async () => {
    data.listBookableLocations.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await loadRoomFinder({ viewer: STUDENT, params: {}, now });
    expect(state).toMatchObject({ kind: "READY", locations: [] });
    spy.mockRestore();
  });
});

describe("dashboard entry (loadDashboardRoomFinder)", () => {
  const bkk = (time: string) => new Date(`2026-09-28T${time}:00+07:00`); // a Monday
  const done = (results: RoomAvailabilityResult[], available = results.length) => ({
    results,
    truncated: available > results.length,
    candidatesTruncated: false,
    statusCounts: { AVAILABLE: available },
  });

  it("14. GUEST and no session get no finder and nothing is queried", async () => {
    expect(await loadDashboardRoomFinder({ viewer: PENDING_GUEST, now: bkk("14:45") })).toBeNull();
    expect(await loadDashboardRoomFinder({ viewer: null, now: bkk("14:45") })).toBeNull();
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
  });

  it("15. inside a slot: one Feature 3 search for today + current slot, party 1, shortlist of 6", async () => {
    data.searchRoomAvailability.mockResolvedValue(done([room("A", true)], 37));
    const finder = await loadDashboardRoomFinder({ viewer: STUDENT, now: bkk("14:45") });
    expect(data.searchRoomAvailability).toHaveBeenCalledTimes(1);
    expect(data.searchRoomAvailability).toHaveBeenCalledWith(
      { date: "2026-09-28", slots: ["SLOT_3"], partySize: 1, requiredCapability: undefined },
      { building: undefined, floor: undefined, onlyAvailable: false, limit: 6 },
      { compare: compareFinderResults, audience: "ALL" }
    );
    expect(finder).toMatchObject({
      // The form shows exactly the query behind the results.
      form: { date: "2026-09-28", slots: ["SLOT_3"], partySize: "1", capability: "", building: "", floor: "" },
      now: { kind: "IN_SLOT", slot: "SLOT_3" },
      search: { kind: "DONE", totalAvailable: 37, limit: 6, availableTruncated: true },
      setup: { today: "2026-09-28", maxDate: "2026-10-28" },
    });
  });

  it.each([
    ["06:00", "BETWEEN"],
    ["11:30", "BETWEEN"],
    ["16:55", "BETWEEN"],
    ["21:00", "DAY_OVER"],
  ])("outside a slot (%s) nothing is searched -> %s, form on today with no slot", async (time, kind) => {
    const finder = await loadDashboardRoomFinder({ viewer: STUDENT, now: bkk(time) });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
    expect(finder).toMatchObject({
      search: null,
      now: { kind },
      form: { date: "2026-09-28", slots: [], partySize: "1" },
    });
  });

  it("names the next slot between slots", async () => {
    const finder = await loadDashboardRoomFinder({ viewer: STUDENT, now: bkk("11:30") });
    expect(finder?.now).toMatchObject({ kind: "BETWEEN", nextSlot: "SLOT_2" });
  });

  it("13. no available rooms is an empty DONE, not an error", async () => {
    data.searchRoomAvailability.mockResolvedValue(done([]));
    const finder = await loadDashboardRoomFinder({ viewer: STUDENT, now: bkk("14:45") });
    expect(finder?.search).toMatchObject({ kind: "DONE", available: [], totalAvailable: 0 });
  });

  it("a backend failure still renders the finder, with a FAILED result", async () => {
    data.searchRoomAvailability.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const finder = await loadDashboardRoomFinder({ viewer: STUDENT, now: bkk("14:45") });
    expect(finder).toMatchObject({ search: { kind: "FAILED" }, now: { kind: "IN_SLOT" } });
    spy.mockRestore();
  });
});

describe("no slot selected: per-slot day search", () => {
  const dayResult = (id: string, free: string[]) => ({
    room: room(id, true).room,
    date: "2026-09-28",
    partySize: 4,
    available: free.length > 0,
    availableSlots: free.map((slot) => ({ slot, remainingCapacity: 10 })),
    slots: [],
    requiresApproval: false,
  });

  it("uses the day search with all four slots evaluated separately - never one multi-slot request", async () => {
    data.searchRoomDayAvailability.mockResolvedValue({
      results: [dayResult("A", ["SLOT_1", "SLOT_3"]), dayResult("B", [])],
      totalAvailable: 9,
      totalUnavailable: 3,
      truncated: true,
      candidatesTruncated: false,
    });
    const state = await loadRoomFinder({
      viewer: STUDENT,
      params: { date: "2026-09-28", slots: "", partySize: "4", building: "A1", floor: "1" },
      now,
    });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
    expect(data.searchRoomDayAvailability).toHaveBeenCalledWith(
      { date: "2026-09-28", slots: ["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"], partySize: 4, requiredCapability: undefined },
      expect.objectContaining({ building: "A1", floor: 1, limit: 50 }),
      compareDayResults,
      "ALL"
    );
    expect(state).toMatchObject({
      search: {
        kind: "DAY",
        consideredSlots: ["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"],
        totalAvailable: 9,
        totalUnavailable: 3,
        availableTruncated: true,
      },
    });
    if (state.kind !== "READY" || state.search?.kind !== "DAY") throw new Error("expected DAY");
    expect(state.search.available.map((r) => r.room.id)).toEqual(["A"]);
    expect(state.search.unavailable.map((r) => r.room.id)).toEqual(["B"]);
  });

  it("today only considers slots that have not ended", async () => {
    data.searchRoomDayAvailability.mockResolvedValue({
      results: [],
      totalAvailable: 0,
      totalUnavailable: 0,
      truncated: false,
      candidatesTruncated: false,
    });
    const afternoon = new Date("2026-09-22T08:00:00Z"); // 15:00 Bangkok
    await loadRoomFinder({ viewer: STUDENT, params: { date: "2026-09-22", slots: "", partySize: "1" }, now: afternoon });
    expect(data.searchRoomDayAvailability.mock.calls[0][0].slots).toEqual(["SLOT_3", "SLOT_4"]);
  });

  it("today after the last slot is an input message, not a search", async () => {
    const night = new Date("2026-09-22T13:00:00Z"); // 20:00 Bangkok
    const state = await loadRoomFinder({ viewer: STUDENT, params: { date: "2026-09-22", slots: "", partySize: "1" }, now: night });
    expect(state).toMatchObject({ search: { kind: "INVALID", error: "NO_SLOTS_LEFT_TODAY" } });
    expect(data.searchRoomDayAvailability).not.toHaveBeenCalled();
  });

  it("a slot selection still uses the slot search", async () => {
    data.searchRoomAvailability.mockResolvedValue({ results: [], truncated: false, candidatesTruncated: false, statusCounts: {} });
    await loadRoomFinder({ viewer: STUDENT, params: search, now });
    expect(data.searchRoomDayAvailability).not.toHaveBeenCalled();
    expect(data.searchRoomAvailability).toHaveBeenCalledTimes(1);
  });
});

describe("Feature 7: approved GUEST, booking links and the 15-minute rule", () => {
  const GUEST = { role: "GUEST", status: "APPROVED" } as const;

  it("approved GUEST gets /rooms over guest-eligible rooms only - search, locations and capability proof", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    data.countBookableRoomsWithCapability.mockResolvedValue(0);
    const state = await loadRoomFinder({ viewer: GUEST, params: { ...search, capability: "LAB" }, now });
    expect(state).toMatchObject({ kind: "READY", canBook: true });
    expect(data.searchRoomAvailability.mock.calls[0][2]).toEqual({ compare: compareFinderResults, audience: "GUEST" });
    expect(data.listBookableLocations).toHaveBeenCalledWith("GUEST");
    expect(data.countBookableRoomsWithCapability).toHaveBeenCalledWith("LAB", "GUEST");
  });

  it("approved GUEST gets the dashboard finder, searched over guest rooms", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    const finder = await loadDashboardRoomFinder({ viewer: GUEST, now: new Date("2026-09-28T07:45:00Z") });
    expect(finder).toMatchObject({ setup: { canBook: true } });
    expect(data.searchRoomAvailability.mock.calls[0][2]).toMatchObject({ audience: "GUEST" });
  });

  it("the no-slot day search is guest-filtered too", async () => {
    data.searchRoomDayAvailability.mockResolvedValue({
      results: [],
      totalAvailable: 0,
      totalUnavailable: 0,
      truncated: false,
      candidatesTruncated: false,
    });
    await loadRoomFinder({ viewer: GUEST, params: { ...search, slots: "" }, now });
    expect(data.searchRoomDayAvailability.mock.calls[0][3]).toBe("GUEST");
  });

  it("STUDENT is never guest-restricted and can book; ADMIN can search but not book", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    expect(await loadRoomFinder({ viewer: STUDENT, params: search, now })).toMatchObject({ canBook: true });
    expect(data.searchRoomAvailability.mock.calls[0][2]).toMatchObject({ audience: "ALL" });
    expect(await loadRoomFinder({ viewer: { role: "ADMIN", status: "APPROVED" }, params: search, now })).toMatchObject({
      kind: "READY",
      canBook: false,
    });
  });

  it("the running slot is marked closed for booking once fewer than 15 minutes remain", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([room("A", true)]));
    // SLOT_2 ends 14:20 Bangkok.
    const at = (time: string) => new Date(`2026-09-28T${time}:00+07:00`);
    const early = await loadDashboardRoomFinder({ viewer: STUDENT, now: at("14:04") });
    expect(early?.search).toMatchObject({ kind: "DONE", bookingClosedSlots: [] });
    const late = await loadDashboardRoomFinder({ viewer: STUDENT, now: at("14:10") });
    expect(late?.search).toMatchObject({ kind: "DONE", bookingClosedSlots: ["SLOT_2"] });
  });
});
