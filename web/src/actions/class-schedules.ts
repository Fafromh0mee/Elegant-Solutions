"use server";

import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
      rowErrors.push(`แถว ${rowNo}: ผู้ใช้คนเดิมลงวิชา ${record.subjectCode} ซ้ำในเทอม ${record.semester}`);
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
        rowErrors.push(`แถว ${record.lineNo}: ผู้ใช้คนเดิมลงวิชา ${record.subjectCode} ในเทอม ${record.semester} อยู่แล้ว`);
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
