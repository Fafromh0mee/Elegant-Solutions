export type Role = "ADMIN" | "STAFF" | "GUEST";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  image?: string | null;
}
