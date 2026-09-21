import type { Role } from "@/lib/types";

// Who may sign in with Google, and with which role. Pure: no Prisma, no I/O.
// auth.ts loads the existing user and applies the decision.

/** Student Google sign-in is limited to this exact domain (no subdomains). */
export const STUDENT_GOOGLE_DOMAIN = "bumail.net";

export type GoogleSignInDenial = "EMAIL_MISSING" | "EMAIL_NOT_VERIFIED" | "DOMAIN_NOT_ALLOWED";

export type GoogleSignInDecision =
  | { allow: false; reason: GoogleSignInDenial }
  | { allow: true; create: true; role: "STUDENT" }
  | { allow: true; create: false; role: Role };

export interface GoogleSignInInput {
  email: string | null | undefined;
  /** Google's `email_verified` claim. Only a literal `true` counts. */
  emailVerified: unknown;
  /** Role of the existing user with this email, from OUR database; null when none. */
  existingRole: Role | null;
}

/** True only for "local@bumail.net", case-insensitive. */
export function isStudentGoogleEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at <= 0 || email.indexOf("@") !== at) return false;
  return email.slice(at + 1).toLowerCase() === STUDENT_GOOGLE_DOMAIN;
}

export function evaluateGoogleSignIn({ email, emailVerified, existingRole }: GoogleSignInInput): GoogleSignInDecision {
  if (!email) return { allow: false, reason: "EMAIL_MISSING" };
  // Required for everyone, admins included: an unverified address must never
  // resolve to an existing account.
  if (emailVerified !== true) return { allow: false, reason: "EMAIL_NOT_VERIFIED" };

  // Existing admins are exempt from the domain rule. The role comes only from our
  // database, never from Google, and is kept unchanged.
  if (existingRole === "ADMIN" || existingRole === "SUPER_ADMIN") {
    return { allow: true, create: false, role: existingRole };
  }

  if (!isStudentGoogleEmail(email)) return { allow: false, reason: "DOMAIN_NOT_ALLOWED" };

  // New Google users are always STUDENT; existing non-admins become STUDENT (unchanged behaviour).
  return existingRole === null
    ? { allow: true, create: true, role: "STUDENT" }
    : { allow: true, create: false, role: "STUDENT" };
}
