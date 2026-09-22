import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MyBookingsSection } from "@/components/my-bookings-section";
import { PENDING_BOOKING_NOTE, toDashboardBookingCard, type DashboardBooking } from "@/lib/room-booking-rules";

// Dashboard "การจองของฉัน": card copy and visibility. Rendered to static HTML - no DOM.
// Also run with TZ=America/New_York: times must come out in Asia/Bangkok regardless.

const render = (bookings: DashboardBooking[] | null) => renderToStaticMarkup(createElement(MyBookingsSection, { bookings }));

const booking = (patch: Partial<DashboardBooking> = {}): DashboardBooking => ({
  id: "bk1",
  status: "APPROVED",
  date: "2026-09-28",
  partySize: 6,
  roomCode: "LAB-01",
  roomName: "ห้องปฏิบัติการ 1",
  slots: ["SLOT_2", "SLOT_3"],
  startAt: "2026-09-28T05:00:00.000Z", // 12:00 Bangkok
  endAt: "2026-09-28T09:50:00.000Z", // 16:50 Bangkok
  inAccessWindow: false,
  isCreator: true,
  creatorName: "สมชาย ใจดี",
  ...patch,
});

describe("card content", () => {
  it("APPROVED inside its access window: 'ใช้งานได้'; PENDING never is, whatever the flag", () => {
    expect(toDashboardBookingCard(booking({ inAccessWindow: true })).statusLabel).toBe("ใช้งานได้");
    expect(toDashboardBookingCard(booking({ status: "PENDING", inAccessWindow: true })).statusLabel).toBe("รออนุมัติ");
  });

  it("APPROVED: room, date, slots, Bangkok time range, party size, 'จองแล้ว', owner-page link", () => {
    expect(toDashboardBookingCard(booking())).toEqual({
      id: "bk1",
      href: "/bookings/bk1",
      roomCode: "LAB-01",
      roomName: "ห้องปฏิบัติการ 1",
      date: "2026-09-28",
      slotLabel: "คาบ 2–3",
      timeLabel: "12:00–16:50",
      partySizeLabel: "6 คน",
      status: "APPROVED",
      statusLabel: "จองแล้ว",
      note: null,
      creatorLine: null,
    });
    expect(toDashboardBookingCard(booking({ slots: ["SLOT_1"], endAt: "2026-09-28T04:00:00.000Z" }))).toMatchObject({
      slotLabel: "คาบ 1",
    });
  });

  it("PENDING: 'รออนุมัติ' plus a note that access is not granted - never worded as confirmed", () => {
    const card = toDashboardBookingCard(booking({ status: "PENDING" }));
    expect(card.statusLabel).toBe("รออนุมัติ");
    expect(card.note).toBe("ยังไม่ได้รับสิทธิ์เข้าใช้ห้องจนกว่าจะได้รับการอนุมัติ");
    expect(card.note).toBe(PENDING_BOOKING_NOTE);
    for (const text of [card.statusLabel, card.note ?? ""]) {
      expect(text).not.toMatch(/จองแล้ว|สำเร็จ|ยืนยัน/);
    }
  });

  it("ids are URL-encoded in the link", () => {
    expect(toDashboardBookingCard(booking({ id: "a/b" })).href).toBe("/bookings/a%2Fb");
  });

  it("shows 'จองโดย {name}' only when the viewer is not the creator", () => {
    expect(toDashboardBookingCard(booking({ isCreator: true })).creatorLine).toBeNull();
    expect(toDashboardBookingCard(booking({ isCreator: false, creatorName: "Bob" })).creatorLine).toBe("จองโดย Bob");
  });
});

describe("section", () => {
  it("hidden when there is nothing to show", () => {
    expect(render(null)).toBe("");
    expect(render([])).toBe("");
  });

  it("renders each booking with its status and link; PENDING carries the no-access note", () => {
    const html = render([booking(), booking({ id: "bk2", status: "PENDING", roomCode: "MEETING-A" })]);
    expect(html).toContain("การจองของฉัน");
    expect(html).toContain('href="/bookings/bk1"');
    expect(html).toContain('href="/bookings/bk2"');
    expect(html).toContain("จองแล้ว");
    expect(html).toContain("รออนุมัติ");
    expect(html).toContain("12:00–16:50");
    expect(html.match(new RegExp(PENDING_BOOKING_NOTE, "g"))).toHaveLength(1); // only the PENDING card
  });
});
