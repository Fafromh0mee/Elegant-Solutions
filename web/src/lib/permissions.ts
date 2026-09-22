import type { AccountStatus, Role } from "@/lib/types";

export function isAdminRole(role: Role): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function isSuperAdmin(role: Role): boolean {
  return role === "SUPER_ADMIN";
}

export function isApprovedAccount(status: AccountStatus): boolean {
  return status === "APPROVED";
}

export function canUseStudentTierRoom(role: Role): boolean {
  return role === "STUDENT" || role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Which rooms a Room Finder user may see and book:
 *  - "ALL":   the normal bookable-room set (STUDENT; ADMIN/SUPER_ADMIN search only).
 *  - "GUEST": only rooms explicitly open to guests (see isGuestEligibleRoom).
 */
export type RoomAudience = "ALL" | "GUEST";

/**
 * The room set a user's Room Finder searches, or null when they may not use it.
 * A GUEST must be APPROVED (a pending or rejected guest gets nothing), matching the
 * middleware and the access-token rules; other roles are not status-gated there either.
 */
export function getRoomAudience(role: Role, status: AccountStatus | null | undefined): RoomAudience | null {
  if (role === "GUEST") return status === "APPROVED" ? "GUEST" : null;
  return "ALL";
}

export function canUseRoomFinder(role: Role, status: AccountStatus | null | undefined): boolean {
  return getRoomAudience(role, status) !== null;
}

/**
 * Feature 7: who may create room bookings - STUDENT and approved GUEST.
 * ADMIN/SUPER_ADMIN can search but do not use the self-service booking flow.
 */
export function canBookRoom(role: Role, status: AccountStatus | null | undefined): boolean {
  return role === "STUDENT" || (role === "GUEST" && status === "APPROVED");
}

/**
 * A room a GUEST may see and book: explicitly open to guests and not staff-only
 * (staffOnly already keeps GUEST out at the gate - api/face/verify).
 */
export function isGuestEligibleRoom(room: { guestAccess: boolean; staffOnly: boolean }): boolean {
  return room.guestAccess && !room.staffOnly;
}
