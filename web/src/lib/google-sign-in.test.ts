import { describe, expect, it } from "vitest";
import { evaluateGoogleSignIn, isStudentGoogleEmail } from "@/lib/google-sign-in";
import type { Role } from "@/lib/types";

const verified = (email: string | null | undefined, existingRole: Role | null = null) =>
  evaluateGoogleSignIn({ email, emailVerified: true, existingRole });

describe("student Google domain", () => {
  it.each(["s6501234@bumail.net", "S6501234@BUMAIL.NET", "first.last@BuMail.Net"])("accepts %s", (email) => {
    expect(isStudentGoogleEmail(email)).toBe(true);
  });

  it.each([
    "someone@gmail.com",
    "someone@elegant.com",
    "someone@sub.bumail.net",
    "someone@bumail.net.evil.com",
    "someone@notbumail.net",
    "someone@bumail.net ",
    "a@b@bumail.net",
    "@bumail.net",
    "bumail.net",
    "",
  ])("rejects %j", (email) => {
    expect(isStudentGoogleEmail(email)).toBe(false);
  });
});

describe("evaluateGoogleSignIn", () => {
  it("new verified @bumail.net user is created as STUDENT", () => {
    expect(verified("s1@bumail.net")).toEqual({ allow: true, create: true, role: "STUDENT" });
  });

  it("new user on any other domain is refused and never created", () => {
    expect(verified("s1@gmail.com")).toEqual({ allow: false, reason: "DOMAIN_NOT_ALLOWED" });
  });

  it("missing email is refused", () => {
    expect(verified(null)).toEqual({ allow: false, reason: "EMAIL_MISSING" });
    expect(verified("")).toEqual({ allow: false, reason: "EMAIL_MISSING" });
  });

  it.each([false, undefined, null, "true", 1])("email_verified=%j is refused, even for @bumail.net", (emailVerified) => {
    expect(evaluateGoogleSignIn({ email: "s1@bumail.net", emailVerified, existingRole: null })).toEqual({
      allow: false,
      reason: "EMAIL_NOT_VERIFIED",
    });
  });

  it("unverified email is refused even for an existing admin", () => {
    expect(evaluateGoogleSignIn({ email: "admin@elegant.com", emailVerified: false, existingRole: "ADMIN" })).toEqual({
      allow: false,
      reason: "EMAIL_NOT_VERIFIED",
    });
  });

  it.each<Role>(["ADMIN", "SUPER_ADMIN"])("existing %s on a non-bumail domain keeps its role", (role) => {
    expect(verified("admin@elegant.com", role)).toEqual({ allow: true, create: false, role });
  });

  it.each<Role>(["ADMIN", "SUPER_ADMIN"])("existing %s on bumail.net keeps its role (never demoted)", (role) => {
    expect(verified("admin@bumail.net", role)).toEqual({ allow: true, create: false, role });
  });

  it("existing STUDENT on bumail.net stays STUDENT", () => {
    expect(verified("s1@bumail.net", "STUDENT")).toEqual({ allow: true, create: false, role: "STUDENT" });
  });

  it("existing GUEST on bumail.net is promoted to STUDENT (unchanged behaviour)", () => {
    expect(verified("g@bumail.net", "GUEST")).toEqual({ allow: true, create: false, role: "STUDENT" });
  });

  it.each<Role>(["STUDENT", "GUEST"])("existing non-bumail %s is refused (row untouched)", (role) => {
    expect(verified("x@gmail.com", role)).toEqual({ allow: false, reason: "DOMAIN_NOT_ALLOWED" });
  });

  it("a new user can never be created with an admin role", () => {
    for (const email of ["a@bumail.net", "a@elegant.com", "admin@bumail.net"]) {
      const decision = verified(email, null);
      if (decision.allow) expect(decision.role).toBe("STUDENT");
    }
  });
});
