import { Prisma } from "@prisma/client";

// The ONE booking lock-order invariant, shared by every code path that writes a
// RoomBooking's state (creation, Feature 8 approve/reject, future cancellation):
//   1. USER lock(s), one per participant, ALWAYS in ascending sorted user-id order -
//      the total order that keeps overlapping participant sets deadlock-free.
//   2. ROOM + DATE lock, always last.
// Transaction-scoped advisory locks: released automatically at commit/rollback.

export const USER_LOCK_NAMESPACE = "room-booking:user";
export const ROOM_LOCK_NAMESPACE = "room-booking:room";

/** The keys lockForBooking acquires, in acquisition order (deduplicated, sorted users, room last). */
export function bookingLockSequence(userIds: readonly string[], roomId: string, date: string): Array<[string, string]> {
  return [
    ...[...new Set(userIds)].sort().map((userId): [string, string] => [USER_LOCK_NAMESPACE, userId]),
    [ROOM_LOCK_NAMESPACE, `${roomId}:${date}`],
  ];
}

/** Sequential, never Promise.all - concurrency safety depends on lock acquisition
 *  actually happening in this order. */
export async function lockForBooking(tx: Prisma.TransactionClient, userIds: readonly string[], roomId: string, date: string) {
  // Waiting longer means heavy contention; fail with BUSY instead of hanging the request.
  await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
  // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void, which cannot be deserialized.
  for (const [namespace, key] of bookingLockSequence(userIds, roomId, date)) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${namespace}), hashtext(${key}))`;
  }
}

/** Lock timeout (55P03), deadlock (40P01), or a transaction that could not start/finish in time. */
export function isContentionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2028" || error.code === "P2034") return true;
  if (error.code !== "P2010") return false;
  const detail = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return detail.includes("55P03") || detail.includes("40P01");
}
