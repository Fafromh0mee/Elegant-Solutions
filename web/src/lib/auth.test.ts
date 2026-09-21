import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercises the real Google signIn callback from auth.ts with NextAuth and Prisma
// mocked, to prove the decision is applied before any user row is written.

type Callbacks = { signIn: (params: Record<string, unknown>) => Promise<boolean> };
const captured = vi.hoisted(() => ({ config: null as null | { callbacks: Callbacks; pages: Record<string, string>; providers: unknown[] } }));
const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: (config: typeof captured.config) => {
    captured.config = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({ default: (options: unknown) => ({ id: "google", options }) }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => ({ id: "credentials", options }) }));
vi.mock("bcryptjs", () => ({ compare: vi.fn(), hash: vi.fn(async () => "hashed") }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: db.findUnique }, $queryRaw: db.queryRaw },
}));

await import("@/lib/auth");
const config = captured.config!;

function google(email: string | null, emailVerified: unknown) {
  const user: Record<string, unknown> = { email, name: "Test" };
  return {
    user,
    call: () =>
      config.callbacks.signIn({
        user,
        account: { provider: "google" },
        profile: { email, email_verified: emailVerified },
      }),
  };
}

beforeEach(() => {
  db.findUnique.mockReset();
  db.queryRaw.mockReset();
});

describe("Google signIn callback", () => {
  it("creates a STUDENT for a new verified @bumail.net account", async () => {
    db.findUnique.mockResolvedValue(null);
    db.queryRaw.mockResolvedValue([{ id: "u_new", role: "STUDENT", status: "APPROVED" }]);
    const attempt = google("s1@bumail.net", true);
    await expect(attempt.call()).resolves.toBe(true);
    expect(db.queryRaw).toHaveBeenCalledTimes(1);
    expect(attempt.user.role).toBe("STUDENT");
  });

  it.each([
    ["s1@gmail.com", true],
    ["s1@bumail.net", false],
    ["s1@bumail.net", undefined],
  ])("refuses %s (verified=%j) without writing anything", async (email, verified) => {
    db.findUnique.mockResolvedValue(null);
    await expect(google(email, verified).call()).resolves.toBe(false);
    expect(db.queryRaw).not.toHaveBeenCalled();
  });

  it("refuses an existing non-bumail STUDENT without demoting or deleting it", async () => {
    db.findUnique.mockResolvedValue({ id: "u1", role: "STUDENT", status: "APPROVED", studentId: null });
    await expect(google("old@gmail.com", true).call()).resolves.toBe(false);
    expect(db.queryRaw).not.toHaveBeenCalled();
  });

  it("refuses to promote an existing non-bumail GUEST", async () => {
    db.findUnique.mockResolvedValue({ id: "g1", role: "GUEST", status: "APPROVED", studentId: null });
    await expect(google("guest@example.com", true).call()).resolves.toBe(false);
    expect(db.queryRaw).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("lets an existing %s in on a non-bumail domain with the role unchanged", async (role) => {
    db.findUnique.mockResolvedValue({ id: "a1", role, status: "APPROVED", studentId: null });
    const attempt = google("admin@elegant.com", true);
    await expect(attempt.call()).resolves.toBe(true);
    expect(db.queryRaw).not.toHaveBeenCalled(); // no role UPDATE
    expect(attempt.user.role).toBe(role);
  });

  it("promotes an existing @bumail.net GUEST to STUDENT (unchanged behaviour)", async () => {
    db.findUnique.mockResolvedValue({ id: "g2", role: "GUEST", status: "PENDING", studentId: null });
    db.queryRaw.mockResolvedValue([{ id: "g2", role: "STUDENT", status: "PENDING" }]);
    const attempt = google("g2@bumail.net", true);
    await expect(attempt.call()).resolves.toBe(true);
    expect(db.queryRaw).toHaveBeenCalledTimes(1);
    expect(attempt.user.role).toBe("STUDENT");
  });

  it("leaves credentials sign-in to the credentials provider", async () => {
    await expect(config.callbacks.signIn({ user: {}, account: { provider: "credentials" } })).resolves.toBe(true);
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it("sends refused sign-ins to /login and hints the bumail.net account chooser", () => {
    expect(config.pages.error).toBe("/login");
    const googleProvider = config.providers.find((p) => (p as { id: string }).id === "google") as {
      options: { authorization: { params: { hd: string } } };
    };
    expect(googleProvider.options.authorization.params.hd).toBe("bumail.net");
  });
});
