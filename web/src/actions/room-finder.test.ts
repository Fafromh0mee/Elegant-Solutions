import { beforeEach, describe, expect, it, vi } from "vitest";

// Dashboard Room Finder actions with auth and the Feature 3 data layer mocked:
// who may call them, and that input is re-validated on the server.

const authMock = vi.hoisted(() => vi.fn());
const data = vi.hoisted(() => ({
  searchRoomAvailability: vi.fn(),
  searchRoomDayAvailability: vi.fn(),
  countBookableRoomsWithCapability: vi.fn(),
  listBookableLocations: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/availability-context", () => data);

const { searchRoomFinderAction } = await import("@/actions/room-finder");

// The action uses the real server clock, so dates are built relative to today.
const { toAcademicDateString, addAcademicDays } = await import("@/lib/academic-slots");
const tomorrow = addAcademicDays(toAcademicDateString(new Date()), 1);
const valid = { date: tomorrow, slots: ["SLOT_2", "SLOT_3"], partySize: 6 };

beforeEach(() => {
  authMock.mockReset();
  data.searchRoomAvailability.mockReset().mockResolvedValue({
    results: [],
    truncated: false,
    candidatesTruncated: false,
    statusCounts: {},
  });
  data.searchRoomDayAvailability.mockReset();
  data.countBookableRoomsWithCapability.mockReset();
  data.listBookableLocations.mockReset().mockResolvedValue([{ building: "A4", floor: 2 }]);
});

describe("who may use the dashboard finder", () => {
  it.each([
    ["no session", null],
    ["pending GUEST", { user: { id: "g", role: "GUEST", status: "PENDING" } }],
    ["rejected GUEST", { user: { id: "g", role: "GUEST", status: "REJECTED" } }],
    ["GUEST without status", { user: { id: "g", role: "GUEST" } }],
  ])("%s -> NOT_ALLOWED, nothing queried", async (_label, session) => {
    authMock.mockResolvedValue(session);
    expect(await searchRoomFinderAction(valid)).toEqual({ kind: "NOT_ALLOWED" });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
    expect(data.listBookableLocations).not.toHaveBeenCalled();
  });

  it.each(["STUDENT", "ADMIN", "SUPER_ADMIN"])("%s gets results over all bookable rooms", async (role) => {
    authMock.mockResolvedValue({ user: { id: "u", role, status: "APPROVED" } });
    expect(await searchRoomFinderAction(valid)).toMatchObject({ kind: "DONE" });
    expect(data.searchRoomAvailability.mock.calls[0][2]).toMatchObject({ audience: "ALL" });
  });

  it("approved GUEST gets results over guest-eligible rooms only (filtered server-side)", async () => {
    authMock.mockResolvedValue({ user: { id: "g", role: "GUEST", status: "APPROVED" } });
    expect(await searchRoomFinderAction(valid)).toMatchObject({ kind: "DONE" });
    expect(data.searchRoomAvailability.mock.calls[0][2]).toMatchObject({ audience: "GUEST" });
  });

  it("a client cannot widen a GUEST search by sending an audience", async () => {
    authMock.mockResolvedValue({ user: { id: "g", role: "GUEST", status: "APPROVED" } });
    await searchRoomFinderAction({ ...valid, audience: "ALL" } as never);
    expect(data.searchRoomAvailability.mock.calls[0][2]).toMatchObject({ audience: "GUEST" });
  });
});

describe("server-side validation of the inline search", () => {
  beforeEach(() => authMock.mockResolvedValue({ user: { id: "u", role: "STUDENT", status: "APPROVED" } }));

  it("forwards a valid query to Feature 3 unchanged", async () => {
    await searchRoomFinderAction({ ...valid, capability: "LAB" });
    expect(data.searchRoomAvailability).toHaveBeenCalledWith(
      { date: tomorrow, slots: ["SLOT_2", "SLOT_3"], partySize: 6, requiredCapability: "LAB" },
      { building: undefined, floor: undefined, onlyAvailable: false, limit: 50 },
      expect.objectContaining({ compare: expect.any(Function) })
    );
  });

  it.each([
    [{ ...valid, slots: ["SLOT_1", "SLOT_3"] }, "SLOTS_NOT_CONTIGUOUS"],
    [{ ...valid, partySize: 0 }, "INVALID_PARTY_SIZE"],
    [{ ...valid, date: "2020-01-01" }, "DATE_OUT_OF_RANGE"],
    [{ ...valid, capability: "GYM" }, "INVALID_CAPABILITY"],
  ])("rejects %j without searching", async (input, error) => {
    expect(await searchRoomFinderAction(input)).toEqual({ kind: "INVALID", error });
    expect(data.searchRoomAvailability).not.toHaveBeenCalled();
  });

  it("ignores unknown fields such as a smuggled limit or onlyAvailable", async () => {
    await searchRoomFinderAction({ ...valid, limit: 200, onlyAvailable: true } as never);
    expect(data.searchRoomAvailability.mock.calls[0][1]).toMatchObject({ onlyAvailable: false, limit: 50 });
  });

  it("a backend failure becomes FAILED, never a thrown error", async () => {
    data.searchRoomAvailability.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await searchRoomFinderAction(valid)).toEqual({ kind: "FAILED" });
    spy.mockRestore();
  });
});

describe("result limit (shortlist / แสดงเพิ่ม)", () => {
  beforeEach(() => authMock.mockResolvedValue({ user: { id: "u", role: "STUDENT", status: "APPROVED" } }));

  it.each([
    [6, 6],
    [20, 20],
    [200, 200],
    [undefined, 50],
    [0, 50],
    [201, 50],
    [5.5, 50],
    ["20", 50],
  ])("limit %j -> Feature 3 limit %i", async (limit, expected) => {
    const out = await searchRoomFinderAction(valid, limit);
    expect(data.searchRoomAvailability.mock.calls[0][1]).toMatchObject({ onlyAvailable: false, limit: expected });
    expect(out).toMatchObject({ kind: "DONE", limit: expected });
  });

  it("reports the total available count, not just the rooms returned", async () => {
    data.searchRoomAvailability.mockResolvedValue({
      results: [],
      truncated: true,
      candidatesTruncated: false,
      statusCounts: { AVAILABLE: 37, FULL: 2 },
    });
    expect(await searchRoomFinderAction(valid, 6)).toMatchObject({ totalAvailable: 37, availableTruncated: true });
  });
});
