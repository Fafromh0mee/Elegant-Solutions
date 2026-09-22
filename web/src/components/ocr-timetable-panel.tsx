"use client";

import Script from "next/script";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileImage, Loader2, Upload } from "lucide-react";
import { importOcrTimetableAction } from "@/actions/ocr-timetable";
import { slotForTimeRange } from "@/lib/academic-slots";
import { normalizeDay, normalizeRoom, parseOcrBatch, validateOcrRows, type OcrTimetableBatch, type OcrTimetableRow } from "@/lib/ocr-timetable";

type Setup = {
  activeSemester: string | null;
  rooms: Array<{ id: string; roomCode: string; name: string }>;
};

type TesseractApi = {
  createWorker: (language: string, oem?: number, options?: { logger?: (message: { status: string; progress: number }) => void }) => Promise<{
    recognize: (image: File) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<void>;
  }>;
};

declare global {
  interface Window { Tesseract?: TesseractApi; }
}

const DAY_OPTIONS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TYPE_OPTIONS = ["LECT", "LAB", "RWS"] as const;

export function OcrTimetablePanel({ setup, authenticatedName }: { setup: Setup; authenticatedName: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<OcrTimetableRow[]>([]);
  const [semester, setSemester] = useState(setup.activeSemester ?? "");
  const [studentName, setStudentName] = useState("");
  const [rawTexts, setRawTexts] = useState<string[]>([]);
  const [debug, setDebug] = useState<OcrTimetableBatch["debug"] | null>(null);
  const [batchWarnings, setBatchWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roomCodes = useMemo(() => setup.rooms.map((room) => room.roomCode), [setup.rooms]);
  const blockingCount = rows.filter((row) => row.status === "error").length;
  const warningCount = rows.filter((row) => row.status === "warning").length;
  const duplicateCount = debug?.mergeDecisions.filter((decision) => decision.includes("duplicate row detected")).length ?? 0;

  async function runOcr() {
    if (!files.length) return setError("กรุณาเลือกภาพตารางเรียนอย่างน้อย 1 ภาพ");
    if (!window.Tesseract) return setError("OCR engine ยังโหลดไม่เสร็จ กรุณาลองอีกครั้ง");
    setLoading(true); setError(""); setSuccess(""); setRows([]); setBatchWarnings([]); setDebug(null); setProgress(0);
    let worker: Awaited<ReturnType<NonNullable<TesseractApi["createWorker"]>>> | null = null;
    try {
      worker = await window.Tesseract.createWorker("eng+tha", 1, {
        logger: (message) => setProgressLabel(`${message.status} · ${Math.round(message.progress * 100)}%`),
      });
      const texts: string[] = [];
      for (const [index, file] of files.entries()) {
        setProgressLabel(`กำลังอ่านภาพที่ ${index + 1}/${files.length}`);
        const result = await worker.recognize(file);
        texts.push(result.data.text);
        setProgress(Math.round(((index + 1) / files.length) * 100));
      }
      const batch = parseOcrBatch(texts);
      setRawTexts(texts);
      setStudentName(batch.studentName);
      setSemester(batch.semester || setup.activeSemester || "");
      setBatchWarnings(batch.warnings);
      setDebug(batch.debug);
      setRows(validateOcrRows(batch.rows, roomCodes));
      setProgressLabel(`อ่านเสร็จ ${batch.rows.length} แถวหลังรวมภาพซ้อน`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "อ่านภาพไม่สำเร็จ");
    } finally {
      if (worker) await worker.terminate();
      setLoading(false);
    }
  }

  function updateRow(index: number, patch: Partial<OcrTimetableRow>) {
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      const slot = slotForTimeRange(next.startTime, next.endTime);
      const errors = next.errors.filter((message) => message !== "เวลาไม่ตรงกับ AcademicSlot ที่รองรับ");
      if (!slot) errors.push("เวลาไม่ตรงกับ AcademicSlot ที่รองรับ");
      const normalizedRoomCode = normalizeRoom(next.room);
      if (!roomCodes.some((code) => normalizeRoom(code) === normalizedRoomCode)) {
        if (!errors.includes("ไม่พบห้องในระบบ")) errors.push("ไม่พบห้องในระบบ");
      } else {
        next.errors = errors.filter((message) => message !== "ไม่พบห้องในระบบ");
      }
      return { ...next, slot, errors: [...new Set(errors)], status: errors.length ? "error" : next.warnings.length ? "warning" : "ready" };
    }));
  }

  async function importRows() {
    setLoading(true); setError(""); setSuccess("");
    const result = await importOcrTimetableAction({ semester, rows });
    setLoading(false);
    if (result.error) return setError([result.error, ...(result.rowErrors ?? [])].join("\n"));
    setSuccess(`นำเข้าสำเร็จ ${result.importedRows} แถว · ข้ามรายการซ้ำ ${result.skippedDuplicates} แถว`);
  }

  const nameWarning = studentName && authenticatedName && !studentName.toLowerCase().includes(authenticatedName.toLowerCase()) && !authenticatedName.toLowerCase().includes(studentName.toLowerCase());
  const semesterWarning = semester && setup.activeSemester && semester !== setup.activeSemester;

  return (
    <section className="card space-y-4">
      <Script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js" strategy="afterInteractive" />
      <div>
        <h2 className="text-lg font-semibold text-gray-900">อ่านตารางเรียนจากภาพ BU Mobile</h2>
        <p className="mt-1 text-sm text-gray-500">อัปโหลดภาพที่มีแถวซ้อนกันได้ ระบบจะรวมและตัดรายการซ้ำก่อนแสดงตัวอย่าง</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">ระบบจะนำเข้าให้บัญชีที่กำลังเข้าสู่ระบบเท่านั้น</p>
        <label className="label">ภาคการศึกษา
          <input className="input mt-1 w-full" value={semester} onChange={(event) => setSemester(event.target.value)} placeholder="เช่น 2/2026" />
        </label>
      </div>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-sm text-gray-600 hover:bg-gray-100">
        <FileImage className="h-5 w-5" />
        <span>{files.length ? `เลือกแล้ว ${files.length} ภาพ` : "เลือกภาพตารางเรียน 1–5 ภาพ"}</span>
        <input type="file" className="hidden" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))} />
      </label>
      <button type="button" className="btn-primary" onClick={() => void runOcr()} disabled={loading || !files.length}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        อ่านตารางเรียน
      </button>
      {loading && <p className="text-sm text-gray-600" aria-live="polite">{progressLabel} ({progress}%)</p>}
      {studentName && <p className="text-sm text-gray-600">ชื่อจากภาพ: {studentName}</p>}
      {nameWarning && <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />ชื่อในตารางเรียนอาจไม่ตรงกับนักศึกษาที่เลือก กรุณาตรวจสอบ</p>}
      {semesterWarning && <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />ภาคการศึกษาในภาพ/ตัวอย่าง ({semester}) ไม่ตรงกับ ACTIVE_SEMESTER ({setup.activeSemester}) กรุณาตรวจสอบ</p>}
      {batchWarnings.map((warning) => <p key={warning} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{warning}</p>)}
      {error && <p className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</p>}
      {!!rows.length && <>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <div><p className="font-medium">ตัวอย่างตารางเรียน</p><p className="text-xs text-gray-500">พบ {rows.length + duplicateCount} รายการ · รวมรายการซ้ำออก {duplicateCount} รายการ · พร้อมนำเข้า {rows.length - blockingCount - warningCount} รายการ · ต้องตรวจสอบ {warningCount + blockingCount} รายการ</p></div>
          <button type="button" className="btn-primary" onClick={() => void importRows()} disabled={loading || blockingCount > 0 || !semester}><CheckCircle2 className="h-4 w-4" />ยืนยันและนำเข้า</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm"><thead><tr className="border-b text-xs text-gray-500"><th className="p-2">สถานะ</th><th className="p-2">วัน</th><th className="p-2">รหัสวิชา</th><th className="p-2">Section</th><th className="p-2">ชื่อวิชา</th><th className="p-2">ประเภท</th><th className="p-2">เวลา</th><th className="p-2">ห้อง</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={`${row.sourceImageIndex}-${row.sourceLine}-${index}`} className="border-b align-top">
              <td className="p-2"><span className={row.status === "error" ? "text-red-700" : row.status === "warning" ? "text-amber-700" : "text-green-700"}>{row.status === "error" ? "ต้องแก้ไข" : row.status === "warning" ? "คำเตือน" : "พร้อม"}</span><div className="max-w-40 text-xs text-gray-500">{[...row.errors, ...row.warnings].join(" · ")}</div></td>
              <td className="p-2"><select className="input min-w-28" value={row.dayLabel} onChange={(event) => { const day = normalizeDay(event.target.value); updateRow(index, { dayLabel: event.target.value, dayOfWeek: day?.dayOfWeek ?? null }); }}>{DAY_OPTIONS.map((day) => <option key={day}>{day}</option>)}</select></td>
              <td className="p-2"><input className="input w-28" value={row.courseCode} onChange={(event) => updateRow(index, { courseCode: event.target.value.toUpperCase() })} /></td>
              <td className="p-2"><input className="input w-20" value={row.section} onChange={(event) => updateRow(index, { section: event.target.value.toUpperCase() })} /></td>
              <td className="p-2"><input className="input min-w-40" value={row.courseName} onChange={(event) => updateRow(index, { courseName: event.target.value })} /></td>
              <td className="p-2"><select className="input" value={row.classType} onChange={(event) => updateRow(index, { classType: event.target.value as OcrTimetableRow["classType"] })}><option value="">—</option>{TYPE_OPTIONS.map((type) => <option key={type}>{type}</option>)}</select></td>
              <td className="p-2"><input className="input w-28" value={`${row.startTime}-${row.endTime}`} onChange={(event) => { const [startTime, endTime] = event.target.value.split("-"); updateRow(index, { startTime: startTime?.trim() ?? "", endTime: endTime?.trim() ?? "" }); }} /><div className="text-xs text-gray-500">{row.slot ?? "ไม่ตรงคาบ"}</div></td>
              <td className="p-2"><input className="input w-24" list="ocr-room-codes" value={row.room} onChange={(event) => updateRow(index, { room: event.target.value.toUpperCase() })} /></td>
            </tr>)}</tbody></table>
          <datalist id="ocr-room-codes">{roomCodes.map((code) => <option key={code} value={code} />)}</datalist>
        </div>
        <details className="text-xs text-gray-500"><summary>ดูข้อความ OCR สำหรับตรวจสอบ</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3">{rawTexts.map((text, index) => `--- ภาพที่ ${index + 1}: ${files[index]?.name ?? ""} ---\n${text}`).join("\n")}</pre></details>
        {debug && <details className="text-xs text-gray-500"><summary>ดู parser debug (developer)</summary><div className="mt-2 space-y-2 rounded bg-gray-50 p-3"><p>Headers: {debug.courseHeaders.length} · Blocks: {debug.blocks.length} · Merges: {debug.mergeDecisions.length}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify({ headers: debug.courseHeaders, blocks: debug.blocks, parsedRows: debug.parsedRows, mergeDecisions: debug.mergeDecisions }, null, 2)}</pre></div></details>}
      </>}
    </section>
  );
}
