export type Role = "GUEST" | "STUDENT" | "ADMIN" | "SUPER_ADMIN";
export type AccountStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  image?: string | null;
}
