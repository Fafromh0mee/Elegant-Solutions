import { slotForTimeRange } from "@/lib/academic-slots";
import type { AcademicSlot } from "@/lib/types";

export type OcrRowStatus = "ready" | "warning" | "error";
export type OcrClassType = "LECT" | "LAB" | "RWS" | "";

export type OcrTimetableRow = {
  sourceImageIndex: number;
  sourceLine: number;
  rawText: string;
  studentName: string;
  semester: string;
  dayOfWeek: number | null;
  dayLabel: string;
  courseCode: string;
  section: string;
  courseName: string;
  classType: OcrClassType;
  startTime: string;
  endTime: string;
  room: string;
  slot: AcademicSlot | null;
  status: OcrRowStatus;
  warnings: string[];
  errors: string[];
};

export type OcrDebugInfo = {
  normalizedLines: string[][];
  courseHeaders: string[];
  blocks: Array<{ imageIndex: number; startLine: number; endLine: number; lines: string[] }>;
  parsedRows: string[];
  mergeDecisions: string[];
};

export type OcrTimetableBatch = {
  studentName: string;
  semester: string;
  term: number | null;
  academicYearAD: number | null;
  rawSemesterText: string;
  rows: OcrTimetableRow[];
  warnings: string[];
  rawTexts: string[];
  debug: OcrDebugInfo;
};

const DAY_NAMES: Record<string, { dayOfWeek: number; label: string }> = {
  sunday: { dayOfWeek: 0, label: "Sunday" }, sun: { dayOfWeek: 0, label: "Sunday" }, อาทิตย์: { dayOfWeek: 0, label: "Sunday" },
  monday: { dayOfWeek: 1, label: "Monday" }, mon: { dayOfWeek: 1, label: "Monday" }, จันทร์: { dayOfWeek: 1, label: "Monday" },
  tuesday: { dayOfWeek: 2, label: "Tuesday" }, tue: { dayOfWeek: 2, label: "Tuesday" }, อังคาร: { dayOfWeek: 2, label: "Tuesday" },
  wednesday: { dayOfWeek: 3, label: "Wednesday" }, wed: { dayOfWeek: 3, label: "Wednesday" }, พุธ: { dayOfWeek: 3, label: "Wednesday" },
  thursday: { dayOfWeek: 4, label: "Thursday" }, thu: { dayOfWeek: 4, label: "Thursday" }, พฤหัสบดี: { dayOfWeek: 4, label: "Thursday" },
  friday: { dayOfWeek: 5, label: "Friday" }, fri: { dayOfWeek: 5, label: "Friday" }, ศุกร์: { dayOfWeek: 5, label: "Friday" },
  saturday: { dayOfWeek: 6, label: "Saturday" }, sat: { dayOfWeek: 6, label: "Saturday" }, เสาร์: { dayOfWeek: 6, label: "Saturday" },
};

const DAY_PATTERN = Object.keys(DAY_NAMES).sort((a, b) => b.length - a.length).join("|");
const COURSE_HEADER_PATTERN = /\b([A-Z]{2,4})\s*(\d{3,5})\s*\/\s*(\d{3,4})\s*([A-Z])\s+([0-2O]?\d[.:]\d{2})\s*[-–—]\s*([0-2O]?\d[.:]\d{2})/i;
const COURSE_PATTERN = /\b[A-Z]{2,5}\s*[-.]?\s*\d{3,5}\b/i;
const ROOM_PATTERN = /\b[A-Z]\s*\d\s*[-.]\s*\d{3,4}\b/i;
const TIME_RANGE_PATTERN = /([0-2O]?\d)\s*[:.]\s*([0-5]\d)\s*[-–—]\s*([0-2O]?\d)\s*[:.]\s*([0-5]\d)/i;
const SEMESTER_LABEL_PATTERN = /(?:semester|ภาคการศึกษา|ภาคเรียน)/i;
const STRONG_TYPE_PATTERN = /^\s*\(\s*(LECT(?:URE)?|LAB(?:ORATORY)?|RWS)\s*\)\s*$/i;

export function normalizeWhitespace(value: string): string {
  return value.replace(/[\u00a0\t\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function normalizePunctuation(value: string): string {
  return normalizeWhitespace(value).replace(/[‐‑‒–—―]/g, "-").replace(/[“”„‟]/g, '"').replace(/[‘’‚‛]/g, "'");
}

export function normalizeSemester(value: string): string {
  return normalizeWhitespace(value).replace(/\s*\/\s*/g, "/");
}

export function normalizeDay(value: string): { dayOfWeek: number; label: string } | null {
  return DAY_NAMES[normalizeWhitespace(value).toLowerCase().replace(/[.]/g, "")] ?? null;
}

export function normalizeTime(value: string, field: "time" | "section" = "time"): string {
  let result = normalizeWhitespace(value).replace(/[.]/g, ":");
  if (field === "time") {
    result = result.replace(/[Oo]/g, "0");
    if (/^\d{3,4}$/.test(result)) result = result.padStart(4, "0").replace(/(\d{2})(\d{2})/, "$1:$2");
    const match = result.match(/^(\d{1,2}):(\d{2})$/);
    if (match) result = `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return result;
}

export function normalizeCourseCode(value: string): string {
  return normalizeWhitespace(value).toUpperCase().replace(/\s*[-.]?\s*/g, "");
}

export function normalizeRoom(value: string): string {
  return normalizeWhitespace(value).toUpperCase().replace(/\s*[-.]\s*/g, "-").replace(/\s+/g, "");
}

export function normalizeClassType(value: string): OcrClassType {
  const key = normalizeWhitespace(value).toUpperCase();
  if (key.startsWith("LECT")) return "LECT";
  if (key.startsWith("LAB")) return "LAB";
  if (key === "RWS") return "RWS";
  return "";
}

function parseTimeRange(line: string): { startTime: string; endTime: string } | null {
  const match = line.match(TIME_RANGE_PATTERN);
  if (!match) return null;
  return { startTime: normalizeTime(`${match[1]}:${match[2]}`), endTime: normalizeTime(`${match[3]}:${match[4]}`) };
}

function extractRoom(line: string): string {
  const match = line.match(ROOM_PATTERN);
  return match ? normalizeRoom(match[0]) : "";
}

function isDayHeading(line: string): { dayOfWeek: number; label: string } | null {
  const match = line.match(new RegExp(`^(${DAY_PATTERN})[\s,:-]*$`, "i"));
  return match ? normalizeDay(match[1]) : null;
}

function findDayInLine(line: string): { dayOfWeek: number; label: string } | null {
  const match = line.match(new RegExp(`(?:^|[|, ]+)(${DAY_PATTERN})(?:$|[|, .]+)`, "i"));
  return match ? normalizeDay(match[1]) : null;
}

function isNoiseLine(line: string): boolean {
  const value = normalizeWhitespace(line);
  if (!value || SEMESTER_LABEL_PATTERN.test(value) || isDayHeading(value)) return true;
  // BU Mobile chrome can be captured inside a cropped final course block.
  if (/^(?:£\s*)?class schedule$|^hello,?$|^room no\.?$|^(?:home|services|news)$|^home\s+services\s+news(?:\s+[A-Z]{1,3}\)?)?$/i.test(value)) return true;
  if (/^\(ๆ/.test(value)) return true;
  if (/^[0-9\s\W]+$/.test(value)) return true;
  if (/^\([^)]*\)$/.test(value)) return true;
  return false;
}

function parseSemester(text: string): { semester: string; term: number | null; academicYearAD: number | null; raw: string } {
  const real = text.match(/(Semester\s+\d+\s*\(\s*A\.D\.\s*(\d{4})\s*\)\s*\/\s*(\d+)[^\n]*)/i);
  if (real) return { semester: `${real[3]}/${real[2]}`, term: Number(real[3]), academicYearAD: Number(real[2]), raw: normalizeWhitespace(real[1]) };
  const conventional = text.match(/((?:Semester|ภาคการศึกษา|ภาคเรียน)\s*[:#-]?\s*(\d\s*\/\s*\d{4}))/i);
  if (conventional) {
    const semester = normalizeSemester(conventional[2]);
    const [term, year] = semester.split("/").map(Number);
    return { semester, term, academicYearAD: year, raw: normalizeWhitespace(conventional[1]) };
  }
  return { semester: "", term: null, academicYearAD: null, raw: "" };
}

function extractStudentName(text: string): string {
  const explicit = text.match(/(?:^|\n)\s*(?:student|นักศึกษา|name|ชื่อ)\s*[:#-]\s*([^\n]+)/i);
  const hello = text.match(/hello\s*,?\s*\n\s*([^\n]+)/i);
  const candidate = explicit?.[1] ?? hello?.[1] ?? "";
  return normalizeWhitespace(candidate).replace(/[^\p{L}\p{M}\s.'-].*$/u, "").trim();
}

function makeRow(input: { imageIndex: number; sourceLine: number; rawText: string; semester: string; day: { dayOfWeek: number; label: string } | null; courseCode: string; section: string; courseName: string; classType: OcrClassType; time: { startTime: string; endTime: string } | null; room: string }): OcrTimetableRow {
  const slot = input.time ? slotForTimeRange(input.time.startTime, input.time.endTime) : null;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input.day) errors.push("ไม่พบวันเรียน");
  if (!input.courseCode) errors.push("ไม่พบรหัสวิชา");
  if (!input.time) errors.push("ไม่พบช่วงเวลาเรียน");
  else if (!slot) errors.push("เวลาไม่ตรงกับ AcademicSlot ที่รองรับ");
  if (!input.room) errors.push("ไม่พบรหัสห้อง");
  if (!input.semester) errors.push("ไม่พบภาคการศึกษา");
  if (!input.section) warnings.push("ไม่พบ section");
  if (!input.classType) warnings.push("ไม่พบประเภทวิชา");
  if (!input.courseName) warnings.push("ไม่พบชื่อวิชา");
  return { sourceImageIndex: input.imageIndex, sourceLine: input.sourceLine, rawText: input.rawText, studentName: "", semester: input.semester, dayOfWeek: input.day?.dayOfWeek ?? null, dayLabel: input.day?.label ?? "", courseCode: input.courseCode, section: input.section, courseName: input.courseName, classType: input.classType, startTime: input.time?.startTime ?? "", endTime: input.time?.endTime ?? "", room: input.room, slot, status: errors.length ? "error" : warnings.length ? "warning" : "ready", warnings, errors };
}

function parseLegacyRow(line: string, imageIndex: number, sourceLine: number, semester: string, currentDay: { dayOfWeek: number; label: string } | null): OcrTimetableRow | null {
  const rawText = normalizePunctuation(line);
  const courseMatch = rawText.match(COURSE_PATTERN);
  const time = parseTimeRange(rawText);
  if (!courseMatch || !time) return null;
  const courseCode = normalizeCourseCode(courseMatch[0]);
  const fields = rawText.split(/\||\t|\s{2,}/).map(normalizeWhitespace).filter(Boolean);
  const section = fields.find((field) => /^\d{3,4}[A-Z]$/i.test(field)) ?? "";
  const typeMatch = rawText.match(/\b(LECT(?:URE)?|LAB(?:ORATORY)?|RWS)\b/i);
  const classType = typeMatch ? normalizeClassType(typeMatch[1]) : "";
  const room = [...rawText.matchAll(/\b[A-Z]{1,4}\s*[-.]?\s*\d{2,5}\b/gi)].map((match) => normalizeRoom(match[0])).find((value) => value !== courseCode) ?? "";
  const courseName = fields.find((field) => field !== section && field !== typeMatch?.[1] && !COURSE_PATTERN.test(field) && !TIME_RANGE_PATTERN.test(field) && !/^\d+$/.test(field) && field.toLowerCase() !== currentDay?.label.toLowerCase()) ?? "";
  return makeRow({ imageIndex, sourceLine, rawText, semester, day: currentDay, courseCode, section, courseName, classType, time, room });
}

function parseCourseBlock(lines: string[], start: number, end: number, imageIndex: number, day: { dayOfWeek: number; label: string } | null, semester: string): OcrTimetableRow | null {
  const header = lines[start].match(COURSE_HEADER_PATTERN);
  if (!header) return null;
  const courseCode = normalizeCourseCode(`${header[1]}${header[2]}`);
  const section = `${header[3]}${header[4]}`.toUpperCase();
  const time = { startTime: normalizeTime(header[5]), endTime: normalizeTime(header[6]) };
  const body = lines.slice(start + 1, end);
  const roomLabelIndex = body.findIndex((line) => /^room(?:\s*no\.?)?$/i.test(line));
  const typeIndex = body.findIndex((line) => STRONG_TYPE_PATTERN.test(line));
  const classType = typeIndex >= 0 ? normalizeClassType(body[typeIndex].replace(/[()]/g, "")) : "";
  const room = roomLabelIndex >= 0 ? body.slice(roomLabelIndex + 1).map(extractRoom).find(Boolean) ?? "" : "";
  const nameEnd = [roomLabelIndex, typeIndex, body.length].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  const courseName = body.slice(0, nameEnd).filter((line) => !isNoiseLine(line)).join(" ");
  return makeRow({ imageIndex, sourceLine: start + 1, rawText: lines.slice(start, end).join("\n"), semester, day, courseCode, section, courseName, classType, time, room });
}

function refreshRow(row: OcrTimetableRow): OcrTimetableRow {
  const removed = new Set(["ไม่พบวันเรียน", "ไม่พบรหัสวิชา", "ไม่พบช่วงเวลาเรียน", "เวลาไม่ตรงกับ AcademicSlot ที่รองรับ", "ไม่พบรหัสห้อง", "ไม่พบภาคการศึกษา"]);
  const errors = row.errors.filter((error) => !removed.has(error));
  const slot = row.startTime && row.endTime ? slotForTimeRange(row.startTime, row.endTime) : null;
  if (!row.dayLabel) errors.push("ไม่พบวันเรียน");
  if (!row.courseCode) errors.push("ไม่พบรหัสวิชา");
  if (!row.startTime || !row.endTime) errors.push("ไม่พบช่วงเวลาเรียน");
  else if (!slot) errors.push("เวลาไม่ตรงกับ AcademicSlot ที่รองรับ");
  if (!row.room) errors.push("ไม่พบรหัสห้อง");
  if (!row.semester) errors.push("ไม่พบภาคการศึกษา");
  const warnings = row.warnings.filter((warning) =>
    (warning !== "ไม่พบประเภทวิชา" || !row.classType) &&
    (warning !== "ไม่พบชื่อวิชา" || !row.courseName) &&
    (warning !== "ไม่พบ section" || !row.section)
  );
  return { ...row, slot, warnings: [...new Set(warnings)], errors: [...new Set(errors)], status: errors.length ? "error" : warnings.length ? "warning" : "ready" };
}

function mergeRows(existing: OcrTimetableRow, incoming: OcrTimetableRow, decisions: string[]): OcrTimetableRow {
  const merged = { ...existing };
  const conflicts: string[] = [];
  const completed: string[] = [];
  const scalarFields: Array<keyof OcrTimetableRow> = ["studentName", "semester", "dayLabel", "courseCode", "section", "startTime", "endTime", "room"];
  for (const field of scalarFields) {
    const left = String(existing[field] ?? "");
    const right = String(incoming[field] ?? "");
    if (!left && right) { (merged[field] as string) = right; completed.push(String(field)); }
    else if (left && right && left !== right) conflicts.push(String(field));
  }
  if (!existing.courseName && incoming.courseName) { merged.courseName = incoming.courseName; completed.push("courseName"); }
  else if (incoming.courseName && incoming.courseName.length > existing.courseName.length && incoming.courseName.toLowerCase().includes(existing.courseName.toLowerCase())) { merged.courseName = incoming.courseName; completed.push("courseName"); }
  else if (existing.courseName && incoming.courseName && existing.courseName.toLowerCase() !== incoming.courseName.toLowerCase()) conflicts.push("courseName");
  if (!existing.classType && incoming.classType) { merged.classType = incoming.classType; completed.push("classType"); }
  else if (existing.classType && incoming.classType && existing.classType !== incoming.classType) conflicts.push("classType");
  if (conflicts.length) merged.warnings = [...merged.warnings, `ภาพซ้อนมีค่าขัดแย้ง: ${conflicts.join(", ")}`];
  merged.rawText = `${existing.rawText}\n--- overlap ---\n${incoming.rawText}`;
  merged.warnings = [...new Set([...merged.warnings, ...incoming.warnings])];
  merged.errors = [...new Set([...existing.errors, ...incoming.errors])];
  const pair = `${existing.courseCode}/${existing.section} ภาพที่ ${existing.sourceImageIndex + 1} + ${incoming.sourceImageIndex + 1}`;
  decisions.push(completed.length
    ? `${pair}: duplicate row detected; fields merged: ${completed.join(", ")}`
    : conflicts.length
      ? `${pair}: duplicate row detected; conflicting fields flagged: ${conflicts.join(", ")}`
      : `${pair}: duplicate row detected; equivalent copy dropped`);
  return refreshRow(merged);
}

function coreIdentity(row: OcrTimetableRow): string {
  return [row.courseCode, row.section, row.startTime, row.endTime].join("|");
}

export function parseOcrBatch(texts: string[]): OcrTimetableBatch {
  const normalizedTexts = texts.map((text) => text.replace(/[\u00a0\t]/g, " ").replace(/[‐‑‒–—―]/g, "-").replace(/[“”„‟]/g, '"').replace(/[‘’‚‛]/g, "'"));
  const semesterMeta = normalizedTexts.map(parseSemester).filter((metadata) => metadata.semester);
  const semesterValues = [...new Set(semesterMeta.map((metadata) => metadata.semester))];
  const inheritedSemester = semesterValues.length === 1 ? semesterValues[0] : "";
  const studentNames = [...new Set(normalizedTexts.map(extractStudentName).filter(Boolean))];
  const warnings: string[] = [];
  if (semesterValues.length > 1) warnings.push(`พบภาคการศึกษาหลายค่า: ${semesterValues.join(", ")}`);
  if (studentNames.length > 1) warnings.push("พบชื่อนักศึกษาหลายค่าในภาพที่อัปโหลด");
  const debug: OcrDebugInfo = { normalizedLines: [], courseHeaders: [], blocks: [], parsedRows: [], mergeDecisions: [] };
  const rows: OcrTimetableRow[] = [];
  const leadingRooms: Array<{ imageIndex: number; room: string; firstStartTime: string }> = [];

  normalizedTexts.forEach((text, imageIndex) => {
    const lines = text.split(/\r?\n/).map(normalizePunctuation);
    debug.normalizedLines.push(lines);
    const headers = lines.map((line, index) => ({ line, index, match: line.match(COURSE_HEADER_PATTERN) })).filter((entry) => entry.match);
    debug.courseHeaders.push(...headers.map((entry) => `ภาพที่ ${imageIndex + 1}:${entry.index + 1} ${entry.line}`));
    const firstHeaderIndex = headers[0]?.index ?? lines.length;
    const leadingRoom = lines.slice(0, firstHeaderIndex).map(extractRoom).find(Boolean);
    if (leadingRoom && headers[0]?.match) leadingRooms.push({ imageIndex, room: leadingRoom, firstStartTime: normalizeTime(headers[0].match[5]) });
    if (!headers.length) {
      let currentDay: { dayOfWeek: number; label: string } | null = null;
      lines.forEach((line, index) => { const day = isDayHeading(line) ?? findDayInLine(line); if (day) currentDay = day; const row = parseLegacyRow(line, imageIndex, index + 1, inheritedSemester, currentDay); if (row) rows.push(row); });
      return;
    }
    headers.forEach((header, headerIndex) => {
      const nextHeader = headers[headerIndex + 1]?.index ?? lines.length;
      const nextDayOffset = lines.slice(header.index + 1, nextHeader).findIndex((line) => isDayHeading(line));
      const end = nextDayOffset < 0 ? nextHeader : header.index + 1 + nextDayOffset;
      const day = lines.slice(0, header.index).map(isDayHeading).filter((value) => value !== null).at(-1) ?? null;
      debug.blocks.push({ imageIndex, startLine: header.index + 1, endLine: end, lines: lines.slice(header.index, end) });
      const row = parseCourseBlock(lines, header.index, end, imageIndex, day, inheritedSemester);
      if (row) rows.push(row);
    });
  });

  for (const leading of leadingRooms) {
    const prior = rows.filter((row) => row.sourceImageIndex < leading.imageIndex && !row.room && row.endTime && row.endTime <= leading.firstStartTime).sort((a, b) => b.endTime.localeCompare(a.endTime))[0];
    if (prior) { prior.room = leading.room; Object.assign(prior, refreshRow(prior)); debug.mergeDecisions.push(`ภาพที่ ${leading.imageIndex + 1} นำห้อง ${leading.room} ไปเติม ${prior.courseCode}`); }
  }

  const mergedRows: OcrTimetableRow[] = [];
  for (const row of rows) {
    const prior = mergedRows.find((candidate) => coreIdentity(candidate) === coreIdentity(row) && (candidate.dayOfWeek === null || row.dayOfWeek === null || candidate.dayOfWeek === row.dayOfWeek));
    if (prior) Object.assign(prior, mergeRows(prior, row, debug.mergeDecisions));
    else mergedRows.push(row);
  }
  for (const row of mergedRows) {
    Object.assign(row, refreshRow(row));
    debug.parsedRows.push(JSON.stringify({ courseCode: row.courseCode, section: row.section, day: row.dayLabel, time: `${row.startTime}-${row.endTime}`, courseName: row.courseName, type: row.classType, room: row.room, slot: row.slot, semester: row.semester, status: row.status, warnings: row.warnings, errors: row.errors }));
  }
  return { studentName: studentNames[0] ?? "", semester: inheritedSemester, term: semesterMeta[0]?.term ?? null, academicYearAD: semesterMeta[0]?.academicYearAD ?? null, rawSemesterText: semesterMeta[0]?.raw ?? "", rows: mergedRows, warnings, rawTexts: normalizedTexts, debug };
}

export function validateOcrRows(rows: OcrTimetableRow[], rooms: readonly string[]): OcrTimetableRow[] {
  const roomSet = new Set(rooms.map(normalizeRoom));
  return rows.map((row) => {
    const errors = [...row.errors];
    if (row.room && !roomSet.has(normalizeRoom(row.room))) errors.push("ไม่พบห้องในระบบ");
    return { ...row, warnings: [...new Set(row.warnings)], errors: [...new Set(errors)], status: errors.length ? "error" : row.warnings.length ? "warning" : "ready" };
  });
}
