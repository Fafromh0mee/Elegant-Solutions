import { beforeEach, describe, expect, it, vi } from "vitest";

// getMyOwnedGroupsAction with auth and Prisma mocked: it must list only groups the
// caller OWNS (never groups they merely belong to), which is what the booking
// "เลือกกลุ่ม" picker relies on to avoid a non-owner picking a group that would only
// be rejected at confirm time.

const authMock = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({ group: { findMany: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { getMyOwnedGroupsAction } = await import("@/actions/groups");

beforeEach(() => {
  authMock.mockReset();
  prisma.group.findMany.mockReset();
});

describe("getMyOwnedGroupsAction", () => {
  it("no session -> empty, nothing queried", async () => {
    authMock.mockResolvedValue(null);
    expect(await getMyOwnedGroupsAction()).toEqual({ groups: [] });
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });

  it("queries by ownerId (never membership), with member counts", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    prisma.group.findMany.mockResolvedValue([
      { id: "g1", name: "Project Team A", code: "abc123", _count: { members: 4 } },
      { id: "g2", name: "Solo group", code: "xyz789", _count: { members: 1 } },
    ]);
    const result = await getMyOwnedGroupsAction();
    expect(prisma.group.findMany.mock.calls[0][0]).toMatchObject({ where: { ownerId: "owner-1" } });
    expect(result.groups).toEqual([
      { id: "g1", name: "Project Team A", code: "abc123", memberCount: 4 },
      { id: "g2", name: "Solo group", code: "xyz789", memberCount: 1 },
    ]);
  });

  it("a member-only (non-owner) user gets an empty list", async () => {
    authMock.mockResolvedValue({ user: { id: "member-1" } });
    prisma.group.findMany.mockResolvedValue([]);
    expect(await getMyOwnedGroupsAction()).toEqual({ groups: [] });
  });
});
