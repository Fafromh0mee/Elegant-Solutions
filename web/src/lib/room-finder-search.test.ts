import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomAvailabilityResult } from "@/lib/availability";

// The /rooms loader with the Feature 3 data layer mocked: proves what reaches the
// engine, and how each outcome becomes a page state. No database.

const data = vi.hoisted(() => ({
  searchRoomAvailability: vi.fn(),
  countBookableRoomsWithCapability: vi.fn(),
  listBookableLocations: vi.fn(),
}));
vi.mock("@/lib/availability-context", () => data);

const { loadRoomFinder } = await import("@/lib/room-finder-search");
const { compareFinderResults } = await import("@/lib/room-finder");

// 2026-09-22 10:00 Bangkok.
const now = new Date("2026-09-22T03:00:00Z");
const search = { date: "2026-09-28", slots: "SLOT_2,SLOT_3", partySize: "6" };

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
  data.countBookableRoomsWithCapability.mockReset();
  data.listBookableLocations.mockReset().mockResolvedValue([{ building: "A4", floor: 2 }]);
});

describe("1/2. access", () => {
  it("no session -> UNAUTHENTICATED (page redirects to /login), nothing queried", async () => {
    expect(await loadRoomFinder({ role: null, params: search, now })).toEqual({ kind: "UNAUTHENTICATED" });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
  });

  it("GUEST -> NOT_ALLOWED, nothing queried", async () => {
    expect(await loadRoomFinder({ role: "GUEST", params: search, now })).toEqual({ kind: "NOT_ALLOWED" });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
    expect(data.listBookableLocations).not.toHaveBeenCalled();
  });

  it.each(["STUDENT", "ADMIN", "SUPER_ADMIN"] as const)("%s can use the finder", async (role) => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    const state = await loadRoomFinder({ role, params: search, now });
    expect(state.kind).toBe("READY");
  });
});

describe("3. what reaches the Feature 3 engine", () => {
  it("passes the validated request, filters, limit and the tightest-fit order", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    await loadRoomFinder({
      role: "STUDENT",
      params: { ...search, capability: "LAB", building: "A4", floor: "2" },
      now,
    });
    expect(data.searchRoomAvailability).toHaveBeenCalledTimes(1);
    expect(data.searchRoomAvailability).toHaveBeenCalledWith(
      { date: "2026-09-28", slots: ["SLOT_2", "SLOT_3"], partySize: 6, requiredCapability: "LAB" },
      { building: "A4", floor: 2, onlyAvailable: false, limit: 50 },
      { compare: compareFinderResults }
    );
  });

  it("ทุกประเภท sends no capability and no location filters", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    await loadRoomFinder({ role: "STUDENT", params: search, now });
    const [request, filters] = data.searchRoomAvailability.mock.calls[0];
    expect(request.requiredCapability).toBeUndefined();
    expect(filters).toEqual({ building: undefined, floor: undefined, onlyAvailable: false, limit: 50 });
  });

  it("does not search at all without a submitted request", async () => {
    const state = await loadRoomFinder({ role: "STUDENT", params: { partySize: "6" }, now });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
    expect(state).toMatchObject({ kind: "READY", search: null, today: "2026-09-22", maxDate: "2026-10-22" });
  });

  it("invalid input never reaches the engine", async () => {
    const state = await loadRoomFinder({ role: "STUDENT", params: { ...search, partySize: "0" }, now });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
    expect(state).toMatchObject({ search: { kind: "INVALID", error: "INVALID_PARTY_SIZE" } });
  });
});

describe("results", () => {
  it("splits available from unavailable", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([room("A", true), room("B", false)]));
    const state = await loadRoomFinder({ role: "STUDENT", params: search, now });
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
    const state = await loadRoomFinder({ role: "STUDENT", params: search, now });
    expect(state).toMatchObject({ search: { availableTruncated: true } });
  });

  it("18. flags truncation when the candidate cap was hit", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([room("A", true)], { candidatesTruncated: true }));
    const state = await loadRoomFinder({ role: "STUDENT", params: search, now });
    expect(state).toMatchObject({ search: { availableTruncated: true } });
  });

  it("does not flag truncation when only unavailable rooms were cut", async () => {
    data.searchRoomAvailability.mockResolvedValue(
      outcome([room("A", true)], { statusCounts: { AVAILABLE: 1, CLASS_IN_SESSION: 80 }, truncated: true })
    );
    const state = await loadRoomFinder({ role: "STUDENT", params: search, now });
    expect(state).toMatchObject({ search: { availableTruncated: false } });
  });
});

describe("13. empty states", () => {
  it("generic by default: no capability -> no proof query", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    const state = await loadRoomFinder({ role: "STUDENT", params: search, now });
    expect(data.countBookableRoomsWithCapability).not.toHaveBeenCalled();
    expect(state).toMatchObject({ search: { capabilityHasNoRooms: false } });
  });

  it("capability-specific only when the count proves zero rooms exist", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    data.countBookableRoomsWithCapability.mockResolvedValue(0);
    const state = await loadRoomFinder({ role: "STUDENT", params: { ...search, capability: "EVENT" }, now });
    expect(data.countBookableRoomsWithCapability).toHaveBeenCalledWith("EVENT");
    expect(state).toMatchObject({ search: { capabilityHasNoRooms: true } });
  });

  it("stays generic when rooms of that capability exist (e.g. just too small or busy)", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([]));
    data.countBookableRoomsWithCapability.mockResolvedValue(2);
    const state = await loadRoomFinder({ role: "STUDENT", params: { ...search, capability: "LAB" }, now });
    expect(state).toMatchObject({ search: { capabilityHasNoRooms: false } });
  });

  it("never runs the proof query when rooms were found", async () => {
    data.searchRoomAvailability.mockResolvedValue(outcome([room("A", true)]));
    await loadRoomFinder({ role: "STUDENT", params: { ...search, capability: "LAB" }, now });
    expect(data.countBookableRoomsWithCapability).not.toHaveBeenCalled();
  });
});

describe("14. backend errors", () => {
  it("a failed search becomes FAILED, never an exception or internal code", async () => {
    data.searchRoomAvailability.mockRejectedValue(new Error("connection refused"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await loadRoomFinder({ role: "STUDENT", params: search, now });
    expect(state).toMatchObject({ kind: "READY", search: { kind: "FAILED" } });
    spy.mockRestore();
  });

  it("a failed location lookup still renders the finder", async () => {
    data.listBookableLocations.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await loadRoomFinder({ role: "STUDENT", params: {}, now });
    expect(state).toMatchObject({ kind: "READY", locations: [] });
    spy.mockRestore();
  });
});
