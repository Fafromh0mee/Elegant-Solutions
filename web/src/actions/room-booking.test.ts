import { beforeEach, describe, expect, it, vi } from "vitest";

// Booking confirm + group-preview actions with auth, the booking module and
// navigation mocked: who may call them, that the user comes only from the
// session, and PRG on success.

const authMock = vi.hoisted(() => vi.fn());
const createRoomBooking = vi.hoisted(() => vi.fn());
const loadBookingReview = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  })
);
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/room-booking", () => ({ createRoomBooking, loadBookingReview }));
vi.mock("next/navigation", () => ({ redirect }));

const { createRoomBookingAction, previewGroupBookingAction } = await import("@/actions/room-booking");

const SELF = { kind: "SELF" as const };
const input = { roomId: "room-1", date: "2026-09-28", slots: ["SLOT_2"], capability: "LAB", participants: SELF };

beforeEach(() => {
  authMock.mockReset();
  createRoomBooking.mockReset();
  loadBookingReview.mockReset();
  redirect.mockClear();
});

describe("2/3. who may book", () => {
  it.each([
    ["no session", null],
    ["pending GUEST", { user: { id: "g", role: "GUEST", status: "PENDING" } }],
    ["rejected GUEST", { user: { id: "g", role: "GUEST", status: "REJECTED" } }],
    ["ADMIN", { user: { id: "a", role: "ADMIN", status: "APPROVED" } }],
    ["SUPER_ADMIN", { user: { id: "s", role: "SUPER_ADMIN", status: "APPROVED" } }],
  ])("%s -> NOT_ALLOWED, nothing written", async (_label, session) => {
    authMock.mockResolvedValue(session);
    expect(await createRoomBookingAction(input)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(createRoomBooking).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["STUDENT", "APPROVED"],
    ["GUEST", "APPROVED"],
  ])("%s (%s) reaches booking creation", async (role, status) => {
    authMock.mockResolvedValue({ user: { id: "u1", role, status } });
    createRoomBooking.mockResolvedValue({ ok: false, error: "CAPACITY_INSUFFICIENT", remainingCapacity: 2 });
    expect(await createRoomBookingAction(input)).toEqual({
      ok: false,
      error: "CAPACITY_INSUFFICIENT",
      remainingCapacity: 2,
    });
    expect(createRoomBooking).toHaveBeenCalledTimes(1);
  });
});

describe("input handling", () => {
  beforeEach(() => authMock.mockResolvedValue({ user: { id: "session-user", role: "STUDENT", status: "APPROVED" } }));

  it("the user is the session user; smuggled userId/status/policy are dropped", async () => {
    createRoomBooking.mockResolvedValue({ ok: false, error: "FULL" });
    await createRoomBookingAction({
      ...input,
      userId: "victim",
      status: "APPROVED",
      approvalPolicy: "AUTO",
      decidedById: "x",
    } as never);
    const call = createRoomBooking.mock.calls[0][0];
    expect(call.userId).toBe("session-user");
    expect(call.input).toEqual(input);
    expect(call.now).toBeInstanceOf(Date);
  });

  it("a GROUP request forwards only groupId (+ fingerprint) - never a client-supplied member list", async () => {
    createRoomBooking.mockResolvedValue({ ok: false, error: "GROUP_MEMBERSHIP_CHANGED" });
    await createRoomBookingAction({
      ...input,
      participants: { kind: "GROUP", groupId: "g1", fingerprint: "a|b", members: ["a", "b", "hacked-in"] },
    } as never);
    expect(createRoomBooking.mock.calls[0][0].input.participants).toEqual({
      kind: "GROUP",
      groupId: "g1",
      fingerprint: "a|b",
      members: ["a", "b", "hacked-in"], // extra fields are forwarded harmlessly; validateBookingRequest ignores them
    });
  });

  it("success redirects to the owner-only result page (post-redirect-get)", async () => {
    createRoomBooking.mockResolvedValue({ ok: true, bookingId: "bk 1", status: "APPROVED", reused: false });
    await expect(createRoomBookingAction(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/bookings/bk%201");
  });

  it("an idempotent resubmission redirects to the same booking", async () => {
    createRoomBooking.mockResolvedValue({ ok: true, bookingId: "bk1", status: "PENDING", reused: true });
    await expect(createRoomBookingAction(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/bookings/bk1");
  });

  it("errors are returned as codes, never raw database errors", async () => {
    createRoomBooking.mockResolvedValue({ ok: false, error: "BUSY" });
    expect(await createRoomBookingAction(input)).toEqual({ ok: false, error: "BUSY" });
  });

  it("a non-owner's group is rejected without ever creating a booking", async () => {
    createRoomBooking.mockResolvedValue({ ok: false, error: "NOT_GROUP_OWNER" });
    expect(await createRoomBookingAction({ ...input, participants: { kind: "GROUP", groupId: "not-mine" } })).toEqual({
      ok: false,
      error: "NOT_GROUP_OWNER",
    });
  });

  it("tolerates a missing payload", async () => {
    createRoomBooking.mockResolvedValue({ ok: false, error: "INVALID_ROOM" });
    expect(await createRoomBookingAction(undefined as never)).toEqual({ ok: false, error: "INVALID_ROOM" });
  });
});

describe("previewGroupBookingAction", () => {
  it("no session -> NOT_ALLOWED, nothing loaded", async () => {
    authMock.mockResolvedValue(null);
    expect(await previewGroupBookingAction({ roomId: "room-1", searchParams: {}, participants: { kind: "GROUP", groupId: "g1" } })).toEqual({
      kind: "NOT_ALLOWED",
    });
    expect(loadBookingReview).not.toHaveBeenCalled();
  });

  it("delegates to loadBookingReview with the session user and the requested participant mode", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "STUDENT", status: "APPROVED" } });
    loadBookingReview.mockResolvedValue({ kind: "READY" });
    const searchParams = { date: "2026-09-28", slots: "SLOT_2" };
    const participants = { kind: "GROUP" as const, groupId: "g1" };
    const result = await previewGroupBookingAction({ roomId: "room-1", searchParams, participants });
    expect(result).toEqual({ kind: "READY" });
    expect(loadBookingReview).toHaveBeenCalledWith({
      viewer: { userId: "u1", role: "STUDENT", status: "APPROVED" },
      roomId: "room-1",
      searchParams,
      now: expect.any(Date),
      participants,
    });
  });
});
