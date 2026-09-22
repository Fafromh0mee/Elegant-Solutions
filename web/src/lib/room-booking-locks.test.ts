import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { bookingLockSequence, lockForBooking, ROOM_LOCK_NAMESPACE, USER_LOCK_NAMESPACE } from "@/lib/room-booking-locks";

// The shared booking lock-order invariant used by creation and Feature 8 decisions.

describe("bookingLockSequence", () => {
  it("participant USER locks ascending by id, deduplicated, then ROOM+DATE last", () => {
    expect(bookingLockSequence(["u3", "u1", "u2", "u1"], "room-9", "2030-01-07")).toEqual([
      [USER_LOCK_NAMESPACE, "u1"],
      [USER_LOCK_NAMESPACE, "u2"],
      [USER_LOCK_NAMESPACE, "u3"],
      [ROOM_LOCK_NAMESPACE, "room-9:2030-01-07"],
    ]);
  });

  it("the same participant set in any input order yields the same sequence (deadlock-free total order)", () => {
    const a = bookingLockSequence(["b", "c", "a"], "r", "2030-01-07");
    const b = bookingLockSequence(["c", "a", "b"], "r", "2030-01-07");
    expect(a).toEqual(b);
  });
});

describe("lockForBooking", () => {
  it("sets a lock timeout, then acquires every lock sequentially in exactly that order", async () => {
    const calls: unknown[][] = [];
    let inFlight = 0;
    const tx = {
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        inFlight += 1;
        expect(inFlight).toBe(1); // never two lock statements at once
        calls.push([strings.join("?"), ...values]);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return 0;
      },
    } as unknown as Prisma.TransactionClient;

    await lockForBooking(tx, ["zed", "amy", "kim"], "room-1", "2030-01-07");

    expect(calls[0][0]).toContain("lock_timeout");
    expect(calls.slice(1).map((call) => call.slice(1))).toEqual([
      [USER_LOCK_NAMESPACE, "amy"],
      [USER_LOCK_NAMESPACE, "kim"],
      [USER_LOCK_NAMESPACE, "zed"],
      [ROOM_LOCK_NAMESPACE, "room-1:2030-01-07"],
    ]);
    expect(calls.slice(1).every((call) => String(call[0]).includes("pg_advisory_xact_lock"))).toBe(true);
  });
});
