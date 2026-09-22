import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const activeSemesterMock = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  room: { findMany: vi.fn() },
  classSchedule: { findMany: vi.fn(), createMany: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/system", () => ({ getActiveSemester: activeSemesterMock }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { getOcrImportSetupAction, importOcrTimetableAction } = await import("@/actions/ocr-timetable");

const row = {
  sourceImageIndex: 0,
  sourceLine: 1,
  rawText: "Monday | CS101 | 123A | Intro | LECT | 08:40-11:00 | A101",
  studentName: "",
  semester: "2/2026",
  dayOfWeek: 1,
  dayLabel: "Monday",
  courseCode: "CS101",
  section: "123A",
  courseName: "Intro",
  classType: "LECT" as const,
  startTime: "08:40",
  endTime: "11:00",
  room: "A101",
  slot: "SLOT_1" as const,
  status: "ready" as const,
  warnings: [],
  errors: [],
};

beforeEach(() => {
  authMock.mockReset();
  activeSemesterMock.mockReset().mockResolvedValue("2/2026");
  prisma.room.findMany.mockReset().mockResolvedValue([{ id: "room-1", roomCode: "A101", name: "A101" }]);
  prisma.classSchedule.findMany.mockReset().mockResolvedValue([]);
  prisma.classSchedule.createMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("student OCR setup authorization", () => {
  it.each([
    ["unauthenticated", null],
    ["GUEST", { user: { id: "guest-1", name: "Guest", role: "GUEST", status: "APPROVED" } }],
    ["ADMIN", { user: { id: "admin-1", name: "Admin", role: "ADMIN", status: "APPROVED" } }],
    ["pending STUDENT", { user: { id: "student-1", name: "Student", role: "STUDENT", status: "PENDING" } }],
  ])("rejects %s", async (_label, session) => {
    authMock.mockResolvedValue(session);
    expect(await getOcrImportSetupAction()).toHaveProperty("error");
    expect(prisma.room.findMany).not.toHaveBeenCalled();
  });

  it("allows only an approved student and returns active semester plus rooms", async () => {
    authMock.mockResolvedValue({ user: { id: "student-1", name: "Alice", role: "STUDENT", status: "APPROVED" } });
    await expect(getOcrImportSetupAction()).resolves.toMatchObject({ activeSemester: "2/2026", rooms: [{ roomCode: "A101" }] });
  });
});

describe("student OCR import ownership", () => {
  it("derives ClassSchedule.userId from the authenticated student, never browser input", async () => {
    authMock.mockResolvedValue({ user: { id: "student-1", name: "Alice", role: "STUDENT", status: "APPROVED" } });
    const result = await importOcrTimetableAction({
      semester: "2/2026",
      rows: [row],
      // Deliberate smuggled field: the action type has no target identity.
      studentUserId: "someone-else",
    } as never);
    expect(result).toMatchObject({ success: true, importedRows: 1 });
    expect(prisma.classSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "student-1", semester: "2/2026" } }));
    expect(prisma.classSchedule.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ userId: "student-1" })] }));
  });

  it("rejects unauthenticated and guest imports before querying schedules", async () => {
    authMock.mockResolvedValue(null);
    expect(await importOcrTimetableAction({ semester: "2/2026", rows: [row] })).toHaveProperty("error");
    authMock.mockResolvedValue({ user: { id: "guest-1", name: "Guest", role: "GUEST", status: "APPROVED" } });
    expect(await importOcrTimetableAction({ semester: "2/2026", rows: [row] })).toHaveProperty("error");
    expect(prisma.classSchedule.findMany).not.toHaveBeenCalled();
  });

  it("skips a timetable row already imported for this student", async () => {
    authMock.mockResolvedValue({ user: { id: "student-1", name: "Alice", role: "STUDENT", status: "APPROVED" } });
    prisma.classSchedule.findMany.mockResolvedValue([{
      roomId: "room-1", dayOfWeek: 1, startTime: "08:40", endTime: "11:00",
      section: "123A", subjectCode: "CS101", slot: "SLOT_1", semester: "2/2026",
    }]);
    expect(await importOcrTimetableAction({ semester: "2/2026", rows: [row] })).toMatchObject({ success: true, importedRows: 0, skippedDuplicates: 1 });
    expect(prisma.classSchedule.createMany).not.toHaveBeenCalled();
  });

  it("rejects a client slot that does not match the submitted times", async () => {
    authMock.mockResolvedValue({ user: { id: "student-1", name: "Alice", role: "STUDENT", status: "APPROVED" } });
    expect(await importOcrTimetableAction({ semester: "2/2026", rows: [{ ...row, slot: "SLOT_2" }] })).toHaveProperty("error");
    expect(prisma.classSchedule.createMany).not.toHaveBeenCalled();
  });

  it("rejects a room absent from inventory", async () => {
    authMock.mockResolvedValue({ user: { id: "student-1", name: "Alice", role: "STUDENT", status: "APPROVED" } });
    expect(await importOcrTimetableAction({ semester: "2/2026", rows: [{ ...row, room: "Z999" }] })).toMatchObject({ error: expect.any(String), rowErrors: [expect.stringContaining("ไม่พบห้องในระบบ")] });
    expect(prisma.classSchedule.createMany).not.toHaveBeenCalled();
  });

  it("reports a concurrent duplicate as skipped when createMany inserts zero rows", async () => {
    authMock.mockResolvedValue({ user: { id: "student-1", name: "Alice", role: "STUDENT", status: "APPROVED" } });
    prisma.classSchedule.createMany.mockResolvedValue({ count: 0 });
    expect(await importOcrTimetableAction({ semester: "2/2026", rows: [row] })).toMatchObject({ success: true, importedRows: 0, skippedDuplicates: 1 });
  });
});
