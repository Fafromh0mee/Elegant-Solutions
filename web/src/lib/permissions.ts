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

/** Feature 5: GUEST does not get Room Finder (guest booking rules are Feature 7/9). */
export function canUseRoomFinder(role: Role): boolean {
  return role !== "GUEST";
}
