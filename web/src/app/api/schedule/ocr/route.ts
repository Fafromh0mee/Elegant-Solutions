import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";

// This route reads a class-timetable image/PDF and returns structured rows
// (day, time, subject, section, room text) so the admin UI can show a
// review/edit table before anything is written to the database.
//
// Uses Google's Gemini API (Flash model), which has a genuine free tier —
// no credit card required. Get a key at https://aistudio.google.com/apikey
// and set it as GEMINI_API_KEY.
//
// Nothing here reads real-time location or writes to the DB.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Free-tier Flash model. "gemini-flash-latest" is a Google-maintained alias
// that always points at their current default Flash release, so this stays
// working even after Google ships newer model versions. If your API key's
// free tier ever points at a different model name, override it with the
// GEMINI_MODEL environment variable (e.g. "gemini-2.5-flash").
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const PROMPT = `You are an expert OCR assistant that reads Thai and/or English university or school class timetables (ตารางเรียน/ตารางสอน) from photos, screenshots, or scanned documents.

Look at the provided file and extract every class session you can find. For EACH class session, output an object with exactly these fields:
- "dayOfWeek": integer 0-6, where the day the class meets maps to: อาทิตย์/Sunday=0, จันทร์/Monday=1, อังคาร/Tuesday=2, พุธ/Wednesday=3, พฤหัสบดี/พฤหัส/Thursday=4, ศุกร์/Friday=5, เสาร์/Saturday=6. If the timetable is laid out as a grid with day columns/rows, use the column/row day to determine this for every cell.
- "startTime": 24-hour time as "HH:MM" (e.g. "09:00"). Convert 12-hour or Thai-style times (e.g. "9.00-12.00 น.") into this format.
- "endTime": 24-hour time as "HH:MM".
- "subjectCode": the course/subject code exactly as written, e.g. "CS101" (uppercase). Empty string "" if truly not visible.
- "subjectName": the subject/course title in whatever language it is written. Empty string "" if not visible.
- "section": the lab/lecture section or group code exactly as written (e.g. "327A"). Empty string "" if not visible.
- "roomText": any room, building, or location text written near that class (e.g. "A1-501", "Lab 3", "ห้อง 501 ตึก 5"), verbatim. Empty string "" if not visible.

Rules:
- Only include an entry if you can confidently determine dayOfWeek, startTime, AND endTime. Skip anything you're unsure about rather than guessing wildly.
- One row per class session (if the same subject meets on two different days, output two separate rows).
- Do not invent data that isn't in the image/document.
- If nothing readable is found, return an empty array.`;

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      dayOfWeek: { type: "INTEGER" },
      startTime: { type: "STRING" },
      endTime: { type: "STRING" },
      subjectCode: { type: "STRING" },
      subjectName: { type: "STRING" },
      section: { type: "STRING" },
      roomText: { type: "STRING" },
    },
    required: ["dayOfWeek", "startTime", "endTime"],
  },
};

type OcrExtractedRow = {
  dayOfWeek?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  subjectCode?: unknown;
  subjectName?: unknown;
  section?: unknown;
  roomText?: unknown;
};

function normalizeRoomText(value: string): string {
  return value.toLowerCase().replace(/[\s\-_.]/g, "");
}

function matchRoom(
  roomText: string,
  rooms: Array<{ id: string; roomCode: string; name: string }>,
): string | null {
  const norm = normalizeRoomText(roomText);
  if (!norm) return null;

  const exact = rooms.find((r) => normalizeRoomText(r.roomCode) === norm);
  if (exact) return exact.id;

  const partial = rooms.find((r) => {
    const codeNorm = normalizeRoomText(r.roomCode);
    const nameNorm = normalizeRoomText(r.name);
    return (
      (codeNorm.length > 1 && (norm.includes(codeNorm) || codeNorm.includes(norm))) ||
      (nameNorm.length > 1 && (norm.includes(nameNorm) || nameNorm.includes(norm)))
    );
  });

  return partial ? partial.id : null;
}

function isValidTimeFormat(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !isAdminRole(session.user.role)) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ดำเนินการ" }, { status: 403 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์ กรุณาขอ API Key ฟรีที่ https://aistudio.google.com/apikey แล้วเพิ่ม Environment Variable ชื่อ GEMINI_API_KEY จากนั้นรีสตาร์ทเซิร์ฟเวอร์ หรือใช้แบบ \"กรอกเอง\" ไปก่อน",
        },
        { status: 500 },
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "ไม่สามารถอ่านไฟล์ที่อัพโหลดได้" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "กรุณาเลือกไฟล์รูปภาพหรือ PDF ของตารางเรียน" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, GIF) หรือ PDF เท่านั้น" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 10MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    let aiRes: Response;
    try {
      aiRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PROMPT },
                {
                  inline_data: {
                    mime_type: file.type === "image/jpg" ? "image/jpeg" : file.type,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(55000),
      });
    } catch (err) {
      console.error("[SCHEDULE OCR] fetch failed:", err);
      return NextResponse.json(
        { error: "ไม่สามารถเชื่อมต่อบริการ OCR ได้ กรุณาลองใหม่อีกครั้ง" },
        { status: 503 },
      );
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[SCHEDULE OCR] API error:", aiRes.status, errText);
      const friendly =
        aiRes.status === 400 || aiRes.status === 403
          ? "GEMINI_API_KEY ไม่ถูกต้อง กรุณาตรวจสอบ API Key บนเซิร์ฟเวอร์"
          : aiRes.status === 429
            ? "เรียกใช้งาน AI บ่อยเกินไป (เกิน free tier ต่อนาที/ต่อวัน) กรุณาลองใหม่อีกสักครู่"
            : "บริการ OCR ไม่สามารถประมวลผลไฟล์นี้ได้ กรุณาลองใหม่ หรือใช้แบบ \"กรอกเอง\" แทน";
      return NextResponse.json({ error: friendly }, { status: 502 });
    }

    const aiData = await aiRes.json();

    // Gemini can still refuse/truncate (e.g. safety block, MAX_TOKENS) —
    // surface that clearly instead of failing silently on an empty array.
    const candidate = aiData?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const rawText: string =
      candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";

    if (!rawText && finishReason && finishReason !== "STOP") {
      console.error("[SCHEDULE OCR] Gemini finishReason:", finishReason, JSON.stringify(aiData).slice(0, 500));
      return NextResponse.json(
        {
          error:
            finishReason === "SAFETY"
              ? "ไฟล์นี้ถูกระบบความปลอดภัยของ AI ปฏิเสธ กรุณาลองไฟล์อื่น หรือใช้แบบ \"กรอกเอง\" แทน"
              : "AI อ่านไฟล์นี้ไม่สำเร็จ กรุณาลองใหม่ หรือใช้แบบ \"กรอกเอง\" แทน",
        },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText || "[]");
    } catch (err) {
      console.error("[SCHEDULE OCR] JSON parse failed:", err, rawText.slice(0, 500));
      return NextResponse.json(
        {
          error:
            "ไม่สามารถแปลผลลัพธ์จาก AI เป็นข้อมูลตารางเรียนได้ กรุณาลองใหม่ หรือใช้แบบ \"กรอกเอง\" แทน",
        },
        { status: 502 },
      );
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "รูปแบบผลลัพธ์จาก AI ไม่ถูกต้อง กรุณาลองใหม่ หรือใช้แบบ \"กรอกเอง\" แทน" },
        { status: 502 },
      );
    }

    const rooms = await prisma.room.findMany({
      where: { isActive: true },
      select: { id: true, roomCode: true, name: true },
    });

    const rows = (parsed as OcrExtractedRow[])
      .filter((r): r is Required<OcrExtractedRow> => {
        if (!r || typeof r !== "object") return false;
        const day = r.dayOfWeek;
        const start = r.startTime;
        const end = r.endTime;
        return (
          typeof day === "number" &&
          day >= 0 &&
          day <= 6 &&
          typeof start === "string" &&
          isValidTimeFormat(start) &&
          typeof end === "string" &&
          isValidTimeFormat(end)
        );
      })
      .slice(0, 60)
      .map((r) => {
        const roomText = typeof r.roomText === "string" ? r.roomText.trim() : "";
        const matchedRoomId = matchRoom(roomText, rooms);
        return {
          dayOfWeek: r.dayOfWeek as number,
          startTime: r.startTime as string,
          endTime: r.endTime as string,
          subjectCode: typeof r.subjectCode === "string" ? r.subjectCode.trim().toUpperCase() : "",
          subjectName: typeof r.subjectName === "string" ? r.subjectName.trim() : "",
          section: typeof r.section === "string" ? r.section.trim().toUpperCase() : "",
          roomText,
          roomId: matchedRoomId ?? "",
        };
      });

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "ไม่พบข้อมูลตารางเรียนที่อ่านได้ในไฟล์นี้ กรุณาตรวจสอบไฟล์ (ต้องเห็นวัน เวลาเริ่ม-สิ้นสุดชัดเจน) หรือใช้แบบ \"กรอกเอง\" แทน",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ success: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[SCHEDULE OCR] Unexpected error:", message);
    return NextResponse.json({ error: `เกิดข้อผิดพลาดในระบบ: ${message}` }, { status: 500 });
  }
}
