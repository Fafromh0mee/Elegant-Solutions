import { beforeEach, describe, expect, it, vi } from "vitest";

// Feature 8 admin decision actions with auth and the decision module mocked: who may
// call them, and that the decider always comes from the session.

const authMock = vi.hoisted(() => vi.fn());
const decideRoomBooking = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/room-booking-decision", () => ({ decideRoomBooking }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { approveRoomBookingAction, rejectRoomBookingAction } = await import("@/actions/room-booking-admin");

beforeEach(() => {
  authMock.mockReset();
  decideRoomBooking.mockReset();
  revalidatePath.mockReset();
});

describe("who may decide", () => {
  it.each([
    ["no session", null],
    ["STUDENT", { user: { id: "s", role: "STUDENT", status: "APPROVED" } }],
    ["approved GUEST", { user: { id: "g", role: "GUEST", status: "APPROVED" } }],
    ["pending GUEST", { user: { id: "g", role: "GUEST", status: "PENDING" } }],
  ])("%s -> NOT_ALLOWED for approve and reject, nothing decided", async (_label, session) => {
    authMock.mockResolvedValue(session);
    expect(await approveRoomBookingAction("bk1")).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await rejectRoomBookingAction("bk1", "note")).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(decideRoomBooking).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("%s reaches the decision with the session user as decider", async (role) => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role, status: "APPROVED" } });
    decideRoomBooking.mockResolvedValue({ ok: true, status: "APPROVED" });
    expect(await approveRoomBookingAction("bk1")).toEqual({ ok: true, status: "APPROVED" });
    expect(decideRoomBooking).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "bk1", deciderId: "admin-1", decision: "APPROVE" })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/bookings");

    decideRoomBooking.mockResolvedValue({ ok: true, status: "REJECTED" });
    await rejectRoomBookingAction("bk1", "ห้องไม่ว่าง");
    expect(decideRoomBooking).toHaveBeenLastCalledWith(
      expect.objectContaining({ bookingId: "bk1", deciderId: "admin-1", decision: "REJECT", note: "ห้องไม่ว่าง" })
    );
  });

  it("a failed decision is returned as-is and does not revalidate", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", status: "APPROVED" } });
    decideRoomBooking.mockResolvedValue({ ok: false, error: "CAPACITY_INSUFFICIENT", remainingCapacity: 1 });
    expect(await approveRoomBookingAction("bk1")).toEqual({ ok: false, error: "CAPACITY_INSUFFICIENT", remainingCapacity: 1 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
