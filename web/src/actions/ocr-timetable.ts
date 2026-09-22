"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/system";
import { prisma } from "@/lib/prisma";
import { slotForTimeRange } from "@/lib/academic-slots";
import { normalizeRoom, type OcrTimetableRow } from "@/lib/ocr-timetable";

export async function getOcrImportSetupAction() {
  const session = await auth();
  if (!session || session.user.role !== "STUDENT" || session.user.status !== "APPROVED") {
    return { error: "การนำเข้าตารางเรียนจาก BU Mobile เปิดสำหรับนักศึกษาที่ได้รับอนุมัติเท่านั้น" };
  }

  const [activeSemester, rooms] = await Promise.all([
    getActiveSemester(),
    prisma.room.findMany({ where: { isActive: true }, select: { id: true, roomCode: true, name: true }, orderBy: { roomCode: "asc" } }),
  ]);

  return { activeSemester, rooms };
}

function isRow(value: unknown): value is OcrTimetableRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<OcrTimetableRow>;
  return typeof row.courseCode === "string" && typeof row.room === "string" &&
    typeof row.dayOfWeek === "number" && typeof row.startTime === "string" &&
    typeof row.endTime === "string" && typeof row.semester === "string";
}

function rowKey(row: OcrTimetableRow, semester = row.semester): string {
  return [semester, row.dayOfWeek, row.courseCode, row.section, row.slot ?? `${row.startTime}-${row.endTime}`, normalizeRoom(row.room)].join("|");
}

export async function importOcrTimetableAction(input: {
  semester: string;
  rows: unknown;
}) {
  const session = await auth();
  if (!session || session.user.role !== "STUDENT" || session.user.status !== "APPROVED") {
    return { error: "การนำเข้าตารางเรียนจาก BU Mobile เปิดสำหรับนักศึกษาที่ได้รับอนุมัติเท่านั้น" };
  }
  const semester = input.semester.trim();
  if (!semester) return { error: "กรุณาระบุภาคการศึกษา" };
  if (!Array.isArray(input.rows) || !input.rows.every(isRow) || input.rows.length === 0) {
    return { error: "ข้อมูลตารางเรียนไม่ถูกต้อง" };
  }

  const userId = session.user.id;
  const [rooms, existing] = await Promise.all([
    prisma.room.findMany({ where: { isActive: true }, select: { id: true, roomCode: true } }),
    prisma.classSchedule.findMany({ where: { userId, semester }, select: { roomId: true, dayOfWeek: true, startTime: true, endTime: true, section: true, subjectCode: true, slot: true, semester: true } }),
  ]);

  const roomMap = new Map(rooms.map((room) => [normalizeRoom(room.roomCode), room.id]));
  const seen = new Set<string>();
  const existingKeys = new Set(existing.map((row) => [row.semester, row.dayOfWeek, row.subjectCode ?? "", row.section ?? "", row.slot ?? `${row.startTime}-${row.endTime}`, [...roomMap.entries()].find(([, id]) => id === row.roomId)?.[0] ?? row.roomId].join("|")));
  const records: Array<{
    userId: string;
    roomId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    section: string;
    subjectName: string;
    subjectCode: string;
    semester: string;
    slot: "SLOT_1" | "SLOT_2" | "SLOT_3" | "SLOT_4" | null;
  }> = [];
  const rowErrors: string[] = [];

  for (const [index, row] of input.rows.entries()) {
    const roomId = roomMap.get(normalizeRoom(row.room));
    const slot = slotForTimeRange(row.startTime, row.endTime);
    const validDay = typeof row.dayOfWeek === "number" && row.dayOfWeek >= 0 && row.dayOfWeek <= 6;
    if (!roomId) rowErrors.push(`แถว ${index + 1}: ไม่พบห้องในระบบ (${row.room})`);
    if (!slot || row.slot !== slot) rowErrors.push(`แถว ${index + 1}: เวลาไม่ตรงกับ AcademicSlot ที่รองรับ`);
    if (!validDay || !row.courseCode || !row.startTime || !row.endTime) {
      rowErrors.push(`แถว ${index + 1}: ข้อมูลบังคับไม่ครบ`);
    }
    if (!roomId || !slot || row.slot !== slot || !validDay || !row.courseCode || !row.startTime || !row.endTime) continue;
    const dayOfWeek = row.dayOfWeek as number;
    const key = rowKey(row, semester);
    if (seen.has(key) || existingKeys.has(key)) continue;
    seen.add(key);
    records.push({
      userId,
      roomId,
      dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      section: row.section || "",
      subjectName: row.courseName || "",
      subjectCode: row.courseCode,
      semester,
      slot,
    });
  }

  if (rowErrors.length) return { error: "มีแถวที่ต้องแก้ไขก่อนนำเข้า", rowErrors: rowErrors.slice(0, 30) };
  if (!records.length) return { success: true, importedRows: 0, skippedDuplicates: input.rows.length };

  const created = await prisma.classSchedule.createMany({ data: records, skipDuplicates: true });
  revalidatePath("/dashboard");
  return { success: true, importedRows: created.count, skippedDuplicates: input.rows.length - created.count };
}
