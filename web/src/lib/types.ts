export type Role = "GUEST" | "STUDENT" | "ADMIN" | "SUPER_ADMIN";
export type AccountStatus = "PENDING" | "APPROVED" | "REJECTED";

export type RoomCapability = "CLASSROOM" | "LAB" | "MEETING" | "WORKSHOP" | "EVENT";
export type RoomApprovalPolicy = "AUTO" | "MANUAL";
export type AcademicSlot = "SLOT_1" | "SLOT_2" | "SLOT_3" | "SLOT_4";
export type BookingStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
/** Feature 7.5: how a RoomBookingParticipant row came to be authorized. */
export type BookingParticipantSource = "SELF" | "GROUP";

/** Runtime list of RoomCapability, for validation and admin pickers. */
export const ROOM_CAPABILITY_VALUES: readonly RoomCapability[] = [
  "CLASSROOM",
  "LAB",
  "MEETING",
  "WORKSHOP",
  "EVENT",
];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  studentId?: string | null;
  image?: string | null;
}
