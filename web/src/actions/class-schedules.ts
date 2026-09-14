"use server";

import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import type { ScheduleRowInput } from "@/lib/types";

const classScheduleListSelect = {
  id: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  section: true,
  subjectCode: true,
  subjectName: true,
  semester: true,
  user: { select: { id: true, name: true, studentId: true } },
  room: { select: { id: true, roomCode: true, name: true } },
} satisfies Prisma.ClassScheduleSelect;

type ClassScheduleListRow = Prisma.ClassScheduleGetPayload<{
  select: typeof classScheduleListSelect;
}>;

type ParsedRow = {
  studentId: string;
  roomCode: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  section: string;
  subjectName?: string;
  subjectCode: string;
};

const dayMap: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function parseDayOfWeek(input: string): number | null {
  const raw = input.trim();
  if (/^\d+$/.test(raw)) {
    const num = Number(raw);
    return num >= 0 && num <= 6 ? num : null;
  }

  const mapped = dayMap[raw.toLowerCase()];
  return typeof mapped === "number" ? mapped : null;
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

function normalizeTime(value: string): string {
  return value.trim().replace(".", ":");
}

function isValidSection(value: string): boolean {
  return /^\d{3}[A-G]$/i.test(value.trim());
}

function timeToMinutes(value: string): number {
  const [hh, mm] = value.split(":").map(Number);
  return hh * 60 + mm;
}

function isTimeOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);
  return aStart < bEnd && bStart < aEnd;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current.trim());
  return result;
}

function rowToParsedRow(row: Record<string, string>, lineNo: number): { data?: ParsedRow; error?: string } {
  const studentId = (row.studentid || "").trim();
  const roomCode = (row.roomcode || "").trim();
  const dayRaw = (row.dayofweek || "").trim();
  const startTime = normalizeTime(row.starttime || "");
  const endTime = normalizeTime(row.endtime || "");
  const section = (row.section || "").trim().toUpperCase();
  const subjectCode = (row.subjectcode || "").trim().toUpperCase();

  if (!studentId || !roomCode || !dayRaw || !startTime || !endTime || !section || !subjectCode) {
    return { error: `แถว ${lineNo}: ข้อมูลไม่ครบ (studentId, roomCode, dayOfWeek, startTime, endTime, section, subjectCode)` };
  }

  const dayOfWeek = parseDayOfWeek(dayRaw);
  if (dayOfWeek === null) {
    return { error: `แถว ${lineNo}: dayOfWeek ไม่ถูกต้อง (${dayRaw})` };
  }

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return { error: `แถว ${lineNo}: รูปแบบเวลาไม่ถูกต้อง ต้องเป็น HH:MM` };
  }

  if (!isValidSection(section)) {
    return { error: `แถว ${lineNo}: section ไม่ถูกต้อง (${section}) เช่น 327A` };
  }

  if (startTime >= endTime) {
    return { error: `แถว ${lineNo}: startTime ต้องน้อยกว่า endTime` };
  }

  return {
    data: {
      studentId,
      roomCode,
      dayOfWeek,
      startTime,
      endTime,
      section,
      subjectName: row.subjectname?.trim() || undefined,
      subjectCode,
    },
  };
}

async function parseCsv(buffer: Buffer) {
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { rows: [] as ParsedRow[], errors: ["ไฟล์ CSV ไม่มีข้อมูล"] };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const record: Record<string, string> = {};

    headers.forEach((h, idx) => {
      record[h] = values[idx] ?? "";
    });

    const parsed = rowToParsedRow(record, i + 1);
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }

    rows.push(parsed.data as ParsedRow);
  }

  return { rows, errors };
}

async function parseXlsx(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  const loadInput = buffer as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(loadInput);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { rows: [] as ParsedRow[], errors: ["ไม่พบ Worksheet ในไฟล์ XLSX"] };
  }

  const headerRow = worksheet.getRow(1);
  const headerValues = Array.isArray(headerRow.values) ? headerRow.values.slice(1) : [];
  const headers = headerValues.map((v) => normalizeHeader(String(v ?? "")));

  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    const values = rawValues.map((v) => String(v ?? "").trim());
    const record: Record<string, string> = {};
    headers.forEach((h: string, idx: number) => {
      record[h] = values[idx] ?? "";
    });

    const parsed = rowToParsedRow(record, rowNumber);
    if (parsed.error) {
      errors.push(parsed.error);
      return;
    }

    rows.push(parsed.data as ParsedRow);
  });

  return { rows, errors };
}

export async function importClassSchedulesAction(formData: FormData) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  const file = formData.get("file");
  const semester = String(formData.get("semester") || "").trim();
  const replaceExisting = String(formData.get("replaceExisting") || "false") === "true";

  if (!semester) {
    return { error: "กรุณาระบุภาคการศึกษา เช่น 2/2026" };
  }

  if (!(file instanceof File)) {
    return { error: "กรุณาเลือกไฟล์ CSV หรือ XLSX" };
  }

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    return { error: "รองรับเฉพาะไฟล์ .csv และ .xlsx" };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const parsed = lowerName.endsWith(".csv")
    ? await parseCsv(buffer)
    : await parseXlsx(buffer);

  if (parsed.rows.length === 0) {
    return { error: "ไม่พบข้อมูลที่นำเข้าได้", rowErrors: parsed.errors.slice(0, 30) };
  }

  const studentIds = [...new Set(parsed.rows.map((r) => r.studentId))];
  const roomCodes = [...new Set(parsed.rows.map((r) => r.roomCode))];

  const [users, rooms] = await Promise.all([
    prisma.user.findMany({
      where: { studentId: { in: studentIds }, role: "STUDENT" },
      select: { id: true, studentId: true },
    }),
    prisma.room.findMany({
      where: { roomCode: { in: roomCodes } },
      select: { id: true, roomCode: true },
    }),
  ]);

  const userMap = new Map(users.map((u) => [u.studentId as string, u.id]));
  const roomMap = new Map(rooms.map((r) => [r.roomCode, r.id]));

  const rowErrors = [...parsed.errors];
  const records: Array<{
    lineNo: number;
    userId: string;
    roomId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    section: string;
    subjectName?: string;
    subjectCode: string;
    semester: string;
  }> = [];

  parsed.rows.forEach((r, idx) => {
    const userId = userMap.get(r.studentId);
    const roomId = roomMap.get(r.roomCode);

    if (!userId) {
      rowErrors.push(`แถว ${idx + 2}: ไม่พบ studentId ${r.studentId} ในระบบ`);
      return;
    }

    if (!roomId) {
      rowErrors.push(`แถว ${idx + 2}: ไม่พบ roomCode ${r.roomCode} ในระบบ`);
      return;
    }

    records.push({
      lineNo: idx + 2,
      userId,
      roomId,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      section: r.section,
      subjectName: r.subjectName,
      subjectCode: r.subjectCode,
      semester,
    });
  });

  if (records.length === 0) {
    return { error: "ไม่มีข้อมูลที่ผ่านการตรวจสอบ", rowErrors: rowErrors.slice(0, 30) };
  }

  const seenSubjectPerStudent = new Set<string>();
  const perStudentDaySlots = new Map<string, Array<{ startTime: string; endTime: string; subjectCode: string; section: string }>>();
  const invalidLineNos = new Set<number>();

  records.forEach((record) => {
    const rowNo = record.lineNo;
    const subjectKey = `${record.userId}|${record.subjectCode}|${record.semester}`;
    if (seenSubjectPerStudent.has(subjectKey)) {
      rowErrors.push(`แถว ${rowNo}: ผู้ใช้คนเดิมลงวิชา ${record.subjectCode} ซ้ำในภาคการศึกษา ${record.semester}`);
      invalidLineNos.add(rowNo);
      return;
    }
    seenSubjectPerStudent.add(subjectKey);

    const slotKey = `${record.userId}|${record.semester}|${record.dayOfWeek}`;
    const slots = perStudentDaySlots.get(slotKey) ?? [];
    const conflict = slots.find((slot) =>
      isTimeOverlap(slot.startTime, slot.endTime, record.startTime, record.endTime)
    );

    if (conflict) {
      rowErrors.push(
        `แถว ${rowNo}: เวลาเรียนชนกันกับ ${conflict.subjectCode} (${conflict.section}) ในวันเดียวกัน`
      );
      invalidLineNos.add(rowNo);
      return;
    }

    slots.push({
      startTime: record.startTime,
      endTime: record.endTime,
      subjectCode: record.subjectCode,
      section: record.section,
    });
    perStudentDaySlots.set(slotKey, slots);
  });

  const validRecords = records.filter((record) => !invalidLineNos.has(record.lineNo));

  if (validRecords.length === 0) {
    return { error: "ไม่มีข้อมูลที่ผ่านการตรวจสอบ", rowErrors: rowErrors.slice(0, 30) };
  }

  if (!replaceExisting) {
    const subjectPairs = validRecords.map((r) => ({ userId: r.userId, subjectCode: r.subjectCode, semester: r.semester }));
    const existingSubjectRows = await prisma.classSchedule.findMany({
      where: {
        semester,
        OR: subjectPairs.map((s) => ({ userId: s.userId, subjectCode: s.subjectCode })),
      },
      select: { userId: true, subjectCode: true },
    });

    const existingSubjectSet = new Set(existingSubjectRows.map((s) => `${s.userId}|${s.subjectCode}|${semester}`));
    validRecords.forEach((record) => {
      if (existingSubjectSet.has(`${record.userId}|${record.subjectCode}|${record.semester}`)) {
        rowErrors.push(`แถว ${record.lineNo}: ผู้ใช้คนเดิมลงวิชา ${record.subjectCode} ในภาคการศึกษา ${record.semester} อยู่แล้ว`);
        invalidLineNos.add(record.lineNo);
      }
    });

    const existingSlots = await prisma.classSchedule.findMany({
      where: {
        semester,
        userId: { in: [...new Set(validRecords.map((r) => r.userId))] },
        dayOfWeek: { in: [...new Set(validRecords.map((r) => r.dayOfWeek))] },
      },
      select: {
        userId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        subjectCode: true,
      },
    });

    const existingSlotMap = new Map<string, Array<{ startTime: string; endTime: string; subjectCode: string | null }>>();
    existingSlots.forEach((slot) => {
      const key = `${slot.userId}|${semester}|${slot.dayOfWeek}`;
      const current = existingSlotMap.get(key) ?? [];
      current.push({
        startTime: slot.startTime,
        endTime: slot.endTime,
        subjectCode: slot.subjectCode,
      });
      existingSlotMap.set(key, current);
    });

    validRecords.forEach((record) => {
      const key = `${record.userId}|${record.semester}|${record.dayOfWeek}`;
      const existing = existingSlotMap.get(key) ?? [];
      const overlap = existing.find((slot) =>
        isTimeOverlap(slot.startTime, slot.endTime, record.startTime, record.endTime)
      );

      if (overlap) {
        rowErrors.push(
          `แถว ${record.lineNo}: เวลาเรียนชนกับข้อมูลเดิม${overlap.subjectCode ? ` ของวิชา ${overlap.subjectCode}` : ""}`
        );
        invalidLineNos.add(record.lineNo);
      }
    });
  }

  const finalRecords = validRecords
    .filter((record) => !invalidLineNos.has(record.lineNo))
    .map((record) => ({
      userId: record.userId,
      roomId: record.roomId,
      dayOfWeek: record.dayOfWeek,
      startTime: record.startTime,
      endTime: record.endTime,
      section: record.section,
      subjectName: record.subjectName,
      subjectCode: record.subjectCode,
      semester: record.semester,
    }));

  if (finalRecords.length === 0) {
    return { error: "ไม่มีข้อมูลที่ผ่านการตรวจสอบ", rowErrors: rowErrors.slice(0, 30) };
  }

  if (replaceExisting) {
    await prisma.classSchedule.deleteMany({ where: { semester } });
  }

  const BATCH_SIZE = 1000;
  for (let i = 0; i < finalRecords.length; i += BATCH_SIZE) {
    const chunk = finalRecords.slice(i, i + BATCH_SIZE);
    await prisma.classSchedule.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  await prisma.log.create({
    data: {
      userId: session.user.id,
      action: "SCHEDULE_MODIFIED",
      details: `นำเข้าตารางเรียนจากไฟล์ ${finalRecords.length} รายการ (ภาคการศึกษา ${semester})`,
    },
  });

  revalidatePath("/admin/schedule");

  return {
    success: true,
    importedRows: finalRecords.length,
    rowErrors: rowErrors.slice(0, 30),
  };
}

export async function getMyClassSchedulesAction() {
  const session = await auth();
  if (!session || session.user.role !== "STUDENT") {
    return { schedules: [] as Array<unknown> };
  }

  if (!session.user.studentId) {
    return { schedules: [] as Array<unknown> };
  }

  const schedules = await prisma.classSchedule.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      section: true,
      subjectName: true,
      subjectCode: true,
      semester: true,
      room: {
        select: {
          roomCode: true,
          name: true,
        },
      },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  return { schedules };
}

export async function getClassScheduleSummaryAction() {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { totalSchedules: 0, totalStudents: 0, totalRooms: 0 };
  }

  const [totalSchedules, studentDistinct, roomDistinct] = await Promise.all([
    prisma.classSchedule.count(),
    prisma.classSchedule.findMany({ distinct: ["userId"], select: { userId: true } }),
    prisma.classSchedule.findMany({ distinct: ["roomId"], select: { roomId: true } }),
  ]);

  return {
    totalSchedules,
    totalStudents: studentDistinct.length,
    totalRooms: roomDistinct.length,
  };
}

// ---------------------------------------------------------------------------
// Manage (view / update / delete) individual class schedule rows
// + shared save logic used by both the OCR-upload review table and the
// "กรอกเอง" (manual, no upload) form.
// ---------------------------------------------------------------------------

export async function getScheduleFormOptionsAction() {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return {
      error: "ไม่มีสิทธิ์ดำเนินการ",
      students: [] as Array<{ id: string; name: string; studentId: string | null; email: string }>,
      rooms: [] as Array<{ id: string; roomCode: string; name: string }>,
      semesters: [] as string[],
    };
  }

  const [students, rooms, semesterRows] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT" },
      select: { id: true, name: true, studentId: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.room.findMany({
      where: { isActive: true },
      select: { id: true, roomCode: true, name: true },
      orderBy: { roomCode: "asc" },
    }),
    prisma.classSchedule.findMany({
      distinct: ["semester"],
      select: { semester: true },
    }),
  ]);

  const semesters = semesterRows
    .map((s) => s.semester)
    .filter((s): s is string => Boolean(s))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  return { students, rooms, semesters };
}

export async function listClassSchedulesAction(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  semester?: string;
}) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ", schedules: [] as ClassScheduleListRow[], total: 0, page: 1, pageSize: 10 };
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));
  const search = (params.search ?? "").trim();
  const semester = (params.semester ?? "").trim();

  const where = {
    ...(semester ? { semester } : {}),
    ...(search
      ? {
          OR: [
            { subjectCode: { contains: search, mode: "insensitive" as const } },
            { subjectName: { contains: search, mode: "insensitive" as const } },
            { section: { contains: search, mode: "insensitive" as const } },
            { user: { name: { contains: search, mode: "insensitive" as const } } },
            { user: { studentId: { contains: search, mode: "insensitive" as const } } },
            { room: { roomCode: { contains: search, mode: "insensitive" as const } } },
            { room: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [schedules, total] = await Promise.all([
    prisma.classSchedule.findMany({
      where,
      select: classScheduleListSelect,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.classSchedule.count({ where }),
  ]);

  return { schedules, total, page, pageSize };
}

export async function updateClassScheduleAction(
  id: string,
  data: ScheduleRowInput & { semester: string },
) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  const existing = await prisma.classSchedule.findUnique({
    where: { id },
    include: { user: { select: { name: true, studentId: true } } },
  });
  if (!existing) {
    return { error: "ไม่พบข้อมูลตารางเรียนนี้" };
  }

  const subjectCode = (data.subjectCode || "").trim().toUpperCase();
  const section = (data.section || "").trim().toUpperCase();
  const startTime = normalizeTime(data.startTime || "");
  const endTime = normalizeTime(data.endTime || "");
  const semester = (data.semester || "").trim();

  if (
    typeof data.dayOfWeek !== "number" ||
    data.dayOfWeek < 0 ||
    data.dayOfWeek > 6
  ) {
    return { error: "กรุณาเลือกวันให้ถูกต้อง" };
  }
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return { error: "รูปแบบเวลาไม่ถูกต้อง ต้องเป็น HH:MM" };
  }
  if (startTime >= endTime) {
    return { error: "เวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุด" };
  }
  if (!isValidSection(section)) {
    return { error: `section ไม่ถูกต้อง (${section || "ว่าง"}) เช่น 327A` };
  }
  if (!subjectCode) {
    return { error: "กรุณาระบุรหัสวิชา" };
  }
  if (!semester) {
    return { error: "กรุณาระบุภาคการศึกษา" };
  }
  if (!data.roomId) {
    return { error: "กรุณาเลือกห้องเรียน" };
  }

  const room = await prisma.room.findUnique({ where: { id: data.roomId } });
  if (!room) {
    return { error: "ไม่พบห้องที่เลือก" };
  }

  const duplicate = await prisma.classSchedule.findFirst({
    where: { id: { not: id }, userId: existing.userId, subjectCode, semester },
  });
  if (duplicate) {
    return { error: `นักศึกษาคนนี้ลงวิชา ${subjectCode} ในภาคการศึกษา ${semester} อยู่แล้ว` };
  }

  const sameDaySlots = await prisma.classSchedule.findMany({
    where: {
      id: { not: id },
      userId: existing.userId,
      semester,
      dayOfWeek: data.dayOfWeek,
    },
    select: { startTime: true, endTime: true, subjectCode: true },
  });
  const overlap = sameDaySlots.find((slot) =>
    isTimeOverlap(slot.startTime, slot.endTime, startTime, endTime),
  );
  if (overlap) {
    return { error: `เวลาเรียนชนกับวิชา ${overlap.subjectCode ?? "-"} ในวันเดียวกัน` };
  }

  await prisma.classSchedule.update({
    where: { id },
    data: {
      dayOfWeek: data.dayOfWeek,
      startTime,
      endTime,
      subjectCode,
      subjectName: data.subjectName?.trim() || null,
      section,
      roomId: data.roomId,
      semester,
    },
  });

  await prisma.log.create({
    data: {
      userId: session.user.id,
      action: "SCHEDULE_MODIFIED",
      details: `แก้ไขตารางเรียนวิชา ${subjectCode} ของ ${existing.user.name} (${existing.user.studentId ?? "-"})`,
    },
  });

  revalidatePath("/admin/schedule");
  return { success: true };
}

export async function deleteClassScheduleAction(id: string) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  try {
    const existing = await prisma.classSchedule.findUnique({
      where: { id },
      include: { user: { select: { name: true, studentId: true } } },
    });
    if (!existing) {
      return { error: "ไม่พบข้อมูลหรือเกิดข้อผิดพลาดในการลบ" };
    }

    await prisma.classSchedule.delete({ where: { id } });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "SCHEDULE_MODIFIED",
        details: `ลบตารางเรียนวิชา ${existing.subjectCode ?? "-"} ของ ${existing.user.name} (${existing.user.studentId ?? "-"})`,
      },
    });

    revalidatePath("/admin/schedule");
    return { success: true };
  } catch (error) {
    console.error("Delete class schedule error:", error);
    return { error: "ไม่พบข้อมูลหรือเกิดข้อผิดพลาดในการลบ" };
  }
}

// Bulk-save rows coming from either the OCR review table or the manual
// "กรอกเอง" form. All rows belong to a single student + semester, mirroring
// how a single timetable photo/manual entry usually represents one person's
// weekly schedule. Runs the same duplicate/overlap validation as the
// CSV/XLSX importer above.
export async function saveClassSchedulesAction(input: {
  userId: string;
  semester: string;
  rows: ScheduleRowInput[];
}) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  const semester = (input.semester || "").trim();
  if (!semester) {
    return { error: "กรุณาระบุภาคการศึกษา เช่น 2/2026" };
  }

  const student = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, name: true, studentId: true },
  });
  if (!student || student.role !== "STUDENT") {
    return { error: "กรุณาเลือกนักศึกษาที่ถูกต้อง" };
  }

  if (!input.rows || input.rows.length === 0) {
    return { error: "กรุณาเพิ่มอย่างน้อย 1 รายวิชา" };
  }

  const roomIds = [...new Set(input.rows.map((r) => r.roomId).filter(Boolean))];
  const rooms = await prisma.room.findMany({
    where: { id: { in: roomIds } },
    select: { id: true },
  });
  const validRoomIds = new Set(rooms.map((r) => r.id));

  type CleanRow = {
    rowNo: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subjectCode: string;
    subjectName?: string;
    section: string;
    roomId: string;
  };

  const rowErrors: string[] = [];
  const seenSubjects = new Set<string>();
  const daySlots = new Map<number, Array<{ startTime: string; endTime: string; subjectCode: string }>>();
  const cleanRows: CleanRow[] = [];

  input.rows.forEach((row, idx) => {
    const rowNo = idx + 1;
    const subjectCode = (row.subjectCode || "").trim().toUpperCase();
    const section = (row.section || "").trim().toUpperCase();
    const startTime = normalizeTime(row.startTime || "");
    const endTime = normalizeTime(row.endTime || "");

    if (
      typeof row.dayOfWeek !== "number" ||
      row.dayOfWeek < 0 ||
      row.dayOfWeek > 6
    ) {
      rowErrors.push(`แถวที่ ${rowNo}: กรุณาเลือกวันให้ถูกต้อง`);
      return;
    }
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      rowErrors.push(`แถวที่ ${rowNo}: รูปแบบเวลาไม่ถูกต้อง ต้องเป็น HH:MM`);
      return;
    }
    if (startTime >= endTime) {
      rowErrors.push(`แถวที่ ${rowNo}: เวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุด`);
      return;
    }
    if (!isValidSection(section)) {
      rowErrors.push(`แถวที่ ${rowNo}: section ไม่ถูกต้อง (${section || "ว่าง"}) เช่น 327A`);
      return;
    }
    if (!subjectCode) {
      rowErrors.push(`แถวที่ ${rowNo}: กรุณาระบุรหัสวิชา`);
      return;
    }
    if (!row.roomId || !validRoomIds.has(row.roomId)) {
      rowErrors.push(`แถวที่ ${rowNo}: กรุณาเลือกห้องเรียน`);
      return;
    }
    if (seenSubjects.has(subjectCode)) {
      rowErrors.push(`แถวที่ ${rowNo}: ลงวิชา ${subjectCode} ซ้ำในตารางที่กำลังบันทึก`);
      return;
    }

    const slots = daySlots.get(row.dayOfWeek) ?? [];
    const conflict = slots.find((s) => isTimeOverlap(s.startTime, s.endTime, startTime, endTime));
    if (conflict) {
      rowErrors.push(`แถวที่ ${rowNo}: เวลาเรียนชนกับ ${conflict.subjectCode} ในวันเดียวกัน`);
      return;
    }

    seenSubjects.add(subjectCode);
    slots.push({ startTime, endTime, subjectCode });
    daySlots.set(row.dayOfWeek, slots);

    cleanRows.push({
      rowNo,
      dayOfWeek: row.dayOfWeek,
      startTime,
      endTime,
      subjectCode,
      subjectName: row.subjectName?.trim() || undefined,
      section,
      roomId: row.roomId,
    });
  });

  if (cleanRows.length === 0) {
    return { error: "ไม่มีรายการที่ผ่านการตรวจสอบ", rowErrors };
  }

  const existingSameSubject = await prisma.classSchedule.findMany({
    where: {
      userId: input.userId,
      semester,
      subjectCode: { in: cleanRows.map((r) => r.subjectCode) },
    },
    select: { subjectCode: true },
  });
  const existingSubjectSet = new Set(existingSameSubject.map((r) => r.subjectCode));

  const existingSlots = await prisma.classSchedule.findMany({
    where: {
      userId: input.userId,
      semester,
      dayOfWeek: { in: [...new Set(cleanRows.map((r) => r.dayOfWeek))] },
    },
    select: { dayOfWeek: true, startTime: true, endTime: true, subjectCode: true },
  });

  const finalRows: CleanRow[] = [];
  cleanRows.forEach((row) => {
    if (existingSubjectSet.has(row.subjectCode)) {
      rowErrors.push(
        `แถวที่ ${row.rowNo}: นักศึกษาคนนี้ลงวิชา ${row.subjectCode} ในภาคการศึกษา ${semester} อยู่แล้ว`,
      );
      return;
    }
    const overlap = existingSlots.find(
      (s) =>
        s.dayOfWeek === row.dayOfWeek &&
        isTimeOverlap(s.startTime, s.endTime, row.startTime, row.endTime),
    );
    if (overlap) {
      rowErrors.push(
        `แถวที่ ${row.rowNo}: เวลาเรียนชนกับข้อมูลเดิม${overlap.subjectCode ? ` ของวิชา ${overlap.subjectCode}` : ""}`,
      );
      return;
    }
    finalRows.push(row);
  });

  if (finalRows.length === 0) {
    return { error: "ไม่มีรายการที่บันทึกได้", rowErrors };
  }

  await prisma.classSchedule.createMany({
    data: finalRows.map((r) => ({
      userId: input.userId,
      roomId: r.roomId,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      section: r.section,
      subjectName: r.subjectName,
      subjectCode: r.subjectCode,
      semester,
    })),
    skipDuplicates: true,
  });

  await prisma.log.create({
    data: {
      userId: session.user.id,
      action: "SCHEDULE_MODIFIED",
      details: `บันทึกตารางเรียน ${finalRows.length} รายการ ของ ${student.name} (${student.studentId ?? "-"})`,
    },
  });

  revalidatePath("/admin/schedule");

  return { success: true, savedCount: finalRows.length, rowErrors };
}
