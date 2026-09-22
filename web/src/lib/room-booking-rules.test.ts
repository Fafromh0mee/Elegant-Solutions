import { describe, expect, it } from "vitest";
import type { AvailabilityStatus } from "@/lib/availability";
import { BOOKING_MIN_MINUTES_BEFORE_SLOT_END, isSlotStillBookable } from "@/lib/booking-rules";
import { canBookRoom, canUseRoomFinder, getRoomAudience, isGuestEligibleRoom } from "@/lib/permissions";
import {
  bookingCreatedLogDetails,
  bookingErrorForStatus,
  bookingStatusForPolicy,
  classifyParticipantConflicts,
  computeParticipantFingerprint,
  validateBookingRequest,
  type ParticipantBookingRow,
} from "@/lib/room-booking-rules";
import { getBookingErrorMessage } from "@/lib/ui-terms";

// Feature 7 / 7.5 pure rules. No database, no clock: `now` is always passed in.
// The suite is also run with TZ=America/New_York - nothing may depend on the host zone.

const bkk = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const TODAY = "2026-09-22";
const clockAt = (time: string, date = TODAY) => ({ today: date, now: bkk(date, time) });
const SELF = { kind: "SELF" as const };
const valid = { roomId: "room-1", date: "2026-09-28", slots: ["SLOT_2", "SLOT_3"], participants: SELF };

describe("who may use the finder and book (D1)", () => {
  it("room audience: STUDENT/ADMIN see all bookable rooms, approved GUEST only guest rooms, others none", () => {
    expect(getRoomAudience("STUDENT", "APPROVED")).toBe("ALL");
    expect(getRoomAudience("ADMIN", "APPROVED")).toBe("ALL");
    expect(getRoomAudience("SUPER_ADMIN", "APPROVED")).toBe("ALL");
    expect(getRoomAudience("GUEST", "APPROVED")).toBe("GUEST");
    expect(getRoomAudience("GUEST", "PENDING")).toBeNull();
    expect(getRoomAudience("GUEST", "REJECTED")).toBeNull();
    expect(getRoomAudience("GUEST", null)).toBeNull();
  });

  it("booking / participant eligibility: STUDENT and approved GUEST only - not pending GUEST, not ADMIN/SUPER_ADMIN", () => {
    // canBookRoom is reused verbatim as the per-participant eligibility predicate (§8):
    // whoever can create a booking is exactly who can be a participant in one.
    expect(canBookRoom("STUDENT", "APPROVED")).toBe(true);
    expect(canBookRoom("GUEST", "APPROVED")).toBe(true);
    expect(canBookRoom("GUEST", "PENDING")).toBe(false);
    expect(canBookRoom("GUEST", "REJECTED")).toBe(false);
    expect(canBookRoom("ADMIN", "APPROVED")).toBe(false);
    expect(canBookRoom("SUPER_ADMIN", "APPROVED")).toBe(false);
    expect(canUseRoomFinder("GUEST", "PENDING")).toBe(false);
  });

  it("guest-eligible room = guestAccess AND NOT staffOnly", () => {
    expect(isGuestEligibleRoom({ guestAccess: true, staffOnly: false })).toBe(true);
    expect(isGuestEligibleRoom({ guestAccess: true, staffOnly: true })).toBe(false);
    expect(isGuestEligibleRoom({ guestAccess: false, staffOnly: false })).toBe(false);
    expect(isGuestEligibleRoom({ guestAccess: false, staffOnly: true })).toBe(false);
  });
});

describe("request validation", () => {
  const clock = clockAt("10:00");

  it("accepts a valid SELF request and normalises it", () => {
    expect(validateBookingRequest({ ...valid, slots: ["SLOT_3", "SLOT_2"], capability: "LAB" }, clock)).toEqual({
      ok: true,
      request: { roomId: "room-1", date: "2026-09-28", slots: ["SLOT_2", "SLOT_3"], participants: SELF, requiredCapability: "LAB" },
    });
    expect(validateBookingRequest(valid, clock)).toMatchObject({ ok: true, request: { requiredCapability: null } });
  });

  it("accepts a valid GROUP request, with or without a fingerprint", () => {
    const group = { kind: "GROUP" as const, groupId: "g1" };
    expect(validateBookingRequest({ ...valid, participants: group }, clock)).toEqual({
      ok: true,
      request: { roomId: "room-1", date: "2026-09-28", slots: ["SLOT_2", "SLOT_3"], participants: group, requiredCapability: null },
    });
    const out = validateBookingRequest({ ...valid, participants: { ...group, fingerprint: "a|b" } }, clock);
    expect(out.ok && out.request.participants).toEqual({ kind: "GROUP", groupId: "g1", fingerprint: "a|b" });
  });

  it.each([
    [{ ...valid, roomId: "" }, "INVALID_ROOM"],
    [{ ...valid, roomId: 42 }, "INVALID_ROOM"],
    [{ ...valid, roomId: "x".repeat(65) }, "INVALID_ROOM"],
    // malformed participant selections
    [{ ...valid, participants: undefined }, "INVALID_PARTICIPANTS"],
    [{ ...valid, participants: { kind: "OTHER" } }, "INVALID_PARTICIPANTS"],
    [{ ...valid, participants: { kind: "GROUP" } }, "INVALID_PARTICIPANTS"], // missing groupId
    [{ ...valid, participants: { kind: "GROUP", groupId: "" } }, "INVALID_PARTICIPANTS"],
    [{ ...valid, participants: { kind: "GROUP", groupId: "x".repeat(65) } }, "INVALID_PARTICIPANTS"],
    [{ ...valid, participants: "SELF" }, "INVALID_PARTICIPANTS"],
    [{ ...valid, date: "2026-02-30" }, "INVALID_DATE"],
    // 7. booking horizon: today .. today + 30
    [{ ...valid, date: "2026-09-21" }, "DATE_OUT_OF_RANGE"],
    [{ ...valid, date: "2026-10-23" }, "DATE_OUT_OF_RANGE"],
    // 8. at least one explicit slot - "no slot" is a search mode, never a booking
    [{ ...valid, slots: [] }, "NO_SLOTS"],
    [{ ...valid, slots: undefined }, "NO_SLOTS"],
    // 9. invalid slot
    [{ ...valid, slots: ["SLOT_9"] }, "INVALID_SLOT"],
    [{ ...valid, slots: "SLOT_2" }, "INVALID_SLOT"],
    // 10. non-contiguous
    [{ ...valid, slots: ["SLOT_1", "SLOT_3"] }, "SLOTS_NOT_CONTIGUOUS"],
    [{ ...valid, capability: "GYM" }, "INVALID_CAPABILITY"],
  ])("%j -> %s", (input, error) => {
    expect(validateBookingRequest(input as never, clock)).toEqual({ ok: false, error });
  });

  it("horizon edges are inclusive", () => {
    expect(validateBookingRequest({ ...valid, date: TODAY, slots: ["SLOT_2"] }, clock).ok).toBe(true);
    expect(validateBookingRequest({ ...valid, date: "2026-10-22" }, clock).ok).toBe(true);
  });

  it("only known fields are read - a smuggled userId/status/policy/partySize changes nothing", () => {
    const out = validateBookingRequest(
      { ...valid, userId: "someone-else", status: "APPROVED", approvalPolicy: "AUTO", partySize: 999 } as never,
      clock
    );
    expect(out.ok && Object.keys(out.request).sort()).toEqual(["date", "participants", "requiredCapability", "roomId", "slots"]);
  });

  it("a GROUP selection never carries a client-supplied member list - only groupId (+ fingerprint) survive", () => {
    const out = validateBookingRequest(
      { ...valid, participants: { kind: "GROUP", groupId: "g1", members: ["a", "b", "c"], partySize: 3 } } as never,
      clock
    );
    expect(out.ok && out.request.participants).toEqual({ kind: "GROUP", groupId: "g1", fingerprint: undefined });
  });

  it("tolerates a null/undefined payload", () => {
    expect(validateBookingRequest(null as never, clock)).toEqual({ ok: false, error: "INVALID_ROOM" });
  });
});

describe("24. running slot: bookable only while >= 15 minutes remain (D3)", () => {
  // SLOT_2 = 12:00-14:20 Bangkok.
  it("uses the shared constant", () => expect(BOOKING_MIN_MINUTES_BEFORE_SLOT_END).toBe(15));

  it.each([
    ["11:59", true], // not started
    ["12:30", true],
    ["14:04", true], // 16 min left
    ["14:05", true], // exactly 15 min left
    ["14:06", false], // 14 min left
    ["14:19", false],
    ["14:20", false], // ended
  ])("SLOT_2 at %s -> %s", (time, expected) => {
    expect(isSlotStillBookable(TODAY, "SLOT_2", bkk(TODAY, time))).toBe(expected);
    const out = validateBookingRequest({ ...valid, date: TODAY, slots: ["SLOT_2"] }, clockAt(time));
    if (expected) expect(out.ok).toBe(true);
    else expect(out).toEqual({ ok: false, error: time === "14:20" ? "SLOT_ENDED" : "SLOT_TOO_LATE" });
  });

  it("applies to the first slot of a range; later slots have not started", () => {
    expect(validateBookingRequest({ ...valid, date: TODAY, slots: ["SLOT_2", "SLOT_3"] }, clockAt("14:04")).ok).toBe(true);
    expect(validateBookingRequest({ ...valid, date: TODAY, slots: ["SLOT_2", "SLOT_3"] }, clockAt("14:10"))).toEqual({
      ok: false,
      error: "SLOT_TOO_LATE",
    });
  });

  it("is a time rule only - it never makes a room available (Feature 3 still decides)", () => {
    // validateBookingRequest has no room data at all; CLASS_IN_SESSION etc. still map to errors.
    expect(bookingErrorForStatus("CLASS_IN_SESSION")).toBe("CLASS_IN_SESSION");
  });
});

describe("23. Asia/Bangkok date boundaries", () => {
  it("00:30 Bangkok is already the new day (UTC is still the previous day)", () => {
    const now = new Date("2026-09-22T17:30:00Z"); // 2026-09-23 00:30 Bangkok
    const out = validateBookingRequest({ ...valid, date: "2026-09-23", slots: ["SLOT_1"] }, { today: "2026-09-23", now });
    expect(out.ok).toBe(true);
    expect(validateBookingRequest({ ...valid, date: "2026-09-22", slots: ["SLOT_4"] }, { today: "2026-09-23", now })).toEqual({
      ok: false,
      error: "DATE_OUT_OF_RANGE",
    });
  });

  it("23:30 Bangkok: every slot of today has ended", () => {
    const out = validateBookingRequest({ ...valid, date: TODAY, slots: ["SLOT_4"] }, clockAt("23:30"));
    expect(out).toEqual({ ok: false, error: "SLOT_ENDED" });
  });
});

describe("computeParticipantFingerprint", () => {
  it("sorted, deduplicated, order-independent", () => {
    expect(computeParticipantFingerprint(["b", "a", "c"])).toBe(computeParticipantFingerprint(["a", "c", "b"]));
    expect(computeParticipantFingerprint(["a", "a", "b"])).toBe(computeParticipantFingerprint(["a", "b"]));
  });

  it("changes when the member set changes at all", () => {
    const base = computeParticipantFingerprint(["a", "b", "c"]);
    expect(computeParticipantFingerprint(["a", "b"])).not.toBe(base); // David... er, Carol left
    expect(computeParticipantFingerprint(["a", "b", "c", "d"])).not.toBe(base); // David joined
  });
});

describe("status and policy mapping", () => {
  it("AUTO -> APPROVED, MANUAL -> PENDING", () => {
    expect(bookingStatusForPolicy("AUTO")).toBe("APPROVED");
    expect(bookingStatusForPolicy("MANUAL")).toBe("PENDING");
  });

  const statuses: AvailabilityStatus[] = [
    "AVAILABLE",
    "ROOM_INACTIVE",
    "BOOKING_DISABLED",
    "NOT_CONFIGURED_CAPABILITIES",
    "NOT_CONFIGURED_CAPACITY",
    "CAPABILITY_MISMATCH",
    "OUTSIDE_WINDOW",
    "CLOSED",
    "CLASS_IN_SESSION",
    "FULL",
  ];

  it("25. every Feature 3 status maps to a booking error with a Thai message", () => {
    expect(bookingErrorForStatus("AVAILABLE")).toBeNull();
    for (const status of statuses.filter((s) => s !== "AVAILABLE")) {
      const error = bookingErrorForStatus(status);
      expect(error, status).not.toBeNull();
      const message = getBookingErrorMessage(error as string);
      expect(message, status).toMatch(/[฀-๿]/);
      expect(message, status).not.toBe("เกิดข้อผิดพลาด");
    }
    expect(bookingErrorForStatus("FULL")).toBe("CAPACITY_INSUFFICIENT");
    expect(bookingErrorForStatus("CAPABILITY_MISMATCH")).toBe("CAPABILITY_CHANGED");
    expect(bookingErrorForStatus("BOOKING_DISABLED")).toBe("ROOM_NOT_BOOKABLE");
  });

  it("every booking-only error has its own Thai message, with and without a participant-name detail", () => {
    for (const code of [
      "INVALID_ROOM",
      "SLOT_TOO_LATE",
      "NOT_ALLOWED",
      "ROOM_NOT_FOUND",
      "GUEST_ROOM_NOT_ALLOWED",
      "DUPLICATE_BOOKING",
      "OVERLAPPING_BOOKING",
      "INVALID_PARTICIPANTS",
      "GROUP_NOT_FOUND",
      "NOT_GROUP_OWNER",
      "GROUP_MEMBERSHIP_CHANGED",
      "INELIGIBLE_PARTICIPANT",
      "BUSY",
      "FAILED",
    ]) {
      expect(getBookingErrorMessage(code), code).not.toBe("เกิดข้อผิดพลาด");
    }
    expect(getBookingErrorMessage("CAPACITY_INSUFFICIENT", 3)).toContain("3 ที่");
    expect(getBookingErrorMessage("DUPLICATE_BOOKING", "Bob")).toContain("Bob");
    expect(getBookingErrorMessage("OVERLAPPING_BOOKING", "Bob")).toContain("Bob");
    expect(getBookingErrorMessage("INELIGIBLE_PARTICIPANT", "Bob")).toContain("Bob");
    expect(getBookingErrorMessage("GUEST_ROOM_NOT_ALLOWED", "Bob")).toContain("Bob");
    expect(getBookingErrorMessage("SLOTS_NOT_CONTIGUOUS")).toBe("กรุณาเลือกคาบที่ต่อเนื่องกัน");
  });
});

describe("participant conflict classification (D2, D4, §7)", () => {
  const request = { roomId: "R1", slots: ["SLOT_2", "SLOT_3"] as const };
  const row = (patch: Partial<ParticipantBookingRow>): ParticipantBookingRow => ({
    id: "b1",
    roomId: "R1",
    status: "APPROVED",
    slots: ["SLOT_2", "SLOT_3"],
    participantIds: ["alice"],
    ...patch,
  });
  const classify = (participantIds: string[], rows: ParticipantBookingRow[]) =>
    classifyParticipantConflicts(request, participantIds, rows);

  it("nothing on the date -> null", () => expect(classify(["alice"], [])).toBeNull());

  it("D4: SAME requires the EXACT participant set, room and slots to match - not just partySize", () => {
    expect(classify(["alice"], [row({ slots: ["SLOT_3", "SLOT_2"] })])).toEqual({ kind: "SAME", bookingId: "b1", status: "APPROVED" });
    expect(classify(["alice"], [row({ status: "PENDING" })])).toMatchObject({ kind: "SAME", status: "PENDING" });
    // Same headcount (2), overlapping via alice, but different actual people - NOT the same request.
    expect(classify(["alice", "dave"], [row({ participantIds: ["alice", "bob"] })])).toMatchObject({
      kind: "CONFLICT",
      userId: "alice",
    });
  });

  it("group resubmission: identical participant set (any order) -> SAME", () => {
    expect(classify(["carol", "alice", "bob"], [row({ participantIds: ["alice", "bob", "carol"] })])).toEqual({
      kind: "SAME",
      bookingId: "b1",
      status: "APPROVED",
    });
  });

  it("same room, overlapping slots, different participant set -> CONFLICT/DUPLICATE, names the first sorted conflicting id", () => {
    expect(classify(["alice", "bob"], [row({ participantIds: ["alice"] })])).toEqual({
      kind: "CONFLICT",
      userId: "alice",
      conflictKind: "DUPLICATE",
      bookingId: "b1",
    });
    expect(classify(["alice"], [row({ slots: ["SLOT_3", "SLOT_4"] })])).toMatchObject({ conflictKind: "DUPLICATE" });
  });

  it("partial overlap: only the conflicting participant(s) are named, others with no conflict don't block", () => {
    // A group of 3 (alice, bob, carol) where only bob already has a booking.
    const bobsBooking = row({ id: "b-bob", roomId: "R9", participantIds: ["bob"] });
    expect(classify(["alice", "bob", "carol"], [bobsBooking])).toEqual({
      kind: "CONFLICT",
      userId: "bob",
      conflictKind: "OVERLAP",
      bookingId: "b-bob",
    });
  });

  it("different room, overlapping -> OVERLAP", () => {
    expect(classify(["alice"], [row({ roomId: "R2", slots: ["SLOT_3"] })])).toEqual({
      kind: "CONFLICT",
      userId: "alice",
      conflictKind: "OVERLAP",
      bookingId: "b1",
    });
  });

  it("no slot overlap -> allowed, in the same room or another", () => {
    expect(
      classify(["alice", "bob"], [row({ slots: ["SLOT_1"] }), row({ id: "b2", roomId: "R2", slots: ["SLOT_4"], participantIds: ["bob"] })])
    ).toBeNull();
  });

  it("CANCELLED and REJECTED never block", () => {
    expect(
      classify(["alice", "bob"], [
        row({ status: "CANCELLED" }),
        row({ id: "b2", roomId: "R2", status: "REJECTED", participantIds: ["bob"] }),
      ])
    ).toBeNull();
  });
});

describe("audit details", () => {
  it("ids and codes only, slots in order, no participant identities", () => {
    const details = bookingCreatedLogDetails({
      bookingId: "bk1",
      date: "2026-09-28",
      slots: ["SLOT_3", "SLOT_2"],
      participantCount: 3,
      source: "GROUP",
      policy: "MANUAL",
      status: "PENDING",
    });
    expect(details).toBe("booking bk1 2026-09-28 SLOT_2,SLOT_3 participants=3 source=GROUP policy=MANUAL status=PENDING");
    expect(details).not.toMatch(/user|alice|bob|carol/i);
  });
});
