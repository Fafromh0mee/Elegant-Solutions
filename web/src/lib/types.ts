export type Role = "GUEST" | "STUDENT" | "ADMIN" | "SUPER_ADMIN";
export type AccountStatus = "PENDING" | "APPROVED" | "REJECTED";
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

// One row of a class schedule as edited in the admin UI (OCR review table
// or the manual "add without upload" form) before it is saved to the DB.
export interface ScheduleRowInput {
  dayOfWeek: number; // 0=Sunday ... 6=Saturday
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  subjectCode: string;
  subjectName?: string;
  section: string;
  roomId: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  studentId?: string | null;
  image?: string | null;
}
