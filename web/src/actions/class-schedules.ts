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
  subjectName?: string;
  subjectCode?: string;
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
  const startTime = (row.starttime || "").trim();
  const endTime = (row.endtime || "").trim();

  if (!studentId || !roomCode || !dayRaw || !startTime || !endTime) {
    return { error: `แถว ${lineNo}: ข้อมูลไม่ครบ (studentId, roomCode, dayOfWeek, startTime, endTime)` };
  }

  const dayOfWeek = parseDayOfWeek(dayRaw);
  if (dayOfWeek === null) {
    return { error: `แถว ${lineNo}: dayOfWeek ไม่ถูกต้อง (${dayRaw})` };
  }

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return { error: `แถว ${lineNo}: รูปแบบเวลาไม่ถูกต้อง ต้องเป็น HH:MM` };
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
      subjectName: row.subjectname?.trim() || undefined,
      subjectCode: row.subjectcode?.trim() || undefined,
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
  const semester = String(formData.get("semester") || "").trim() || null;
  const replaceExisting = String(formData.get("replaceExisting") || "false") === "true";

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
    userId: string;
    roomId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subjectName?: string;
    subjectCode?: string;
    semester?: string | null;
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
      userId,
      roomId,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      subjectName: r.subjectName,
      subjectCode: r.subjectCode,
      semester,
    });
  });

  if (records.length === 0) {
    return { error: "ไม่มีข้อมูลที่ผ่านการตรวจสอบ", rowErrors: rowErrors.slice(0, 30) };
  }

  if (replaceExisting) {
    if (semester) {
      await prisma.classSchedule.deleteMany({ where: { semester } });
    } else {
      await prisma.classSchedule.deleteMany({});
    }
  }

  await prisma.classSchedule.createMany({
    data: records,
    skipDuplicates: true,
  });

  revalidatePath("/admin/schedule");

  return {
    success: true,
    importedRows: records.length,
    rowErrors: rowErrors.slice(0, 30),
  };
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
