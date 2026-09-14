"use client";

import { useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Download,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  ScanLine,
  ClipboardEdit,
  Search,
  Loader2,
  CalendarDays,
} from "lucide-react";
import {
  importClassSchedulesAction,
  saveClassSchedulesAction,
  listClassSchedulesAction,
  updateClassScheduleAction,
  deleteClassScheduleAction,
} from "@/actions/class-schedules";
import { AdminPageHeader } from "@/components/admin-page-header";
import type { ScheduleRowInput } from "@/lib/types";

const DAY_LABELS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

type Summary = {
  totalSchedules: number;
  totalStudents: number;
  totalRooms: number;
};

type StudentOption = {
  id: string;
  name: string;
  studentId: string | null;
  email: string;
};

type RoomOption = {
  id: string;
  roomCode: string;
  name: string;
};

type ScheduleListItem = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  section: string | null;
  subjectCode: string | null;
  subjectName: string | null;
  semester: string | null;
  user: { id: string; name: string; studentId: string | null };
  room: { id: string; roomCode: string; name: string };
};

// One row inside the OCR review / manual-entry table. `key` is client-only
// (used for React lists + tracking which row an inline edit belongs to).
type EditableRow = {
  key: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName: string;
  section: string;
  roomId: string;
  roomHint?: string; // room text detected by OCR, shown when roomId couldn't be auto-matched
};

type OcrApiRow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName: string;
  section: string;
  roomText: string;
  roomId: string;
};

function makeKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blankRow(): EditableRow {
  return {
    key: makeKey(),
    dayOfWeek: 1,
    startTime: "",
    endTime: "",
    subjectCode: "",
    subjectName: "",
    section: "",
    roomId: "",
  };
}

// Parses the leading "แถวที่ N: ..." row number out of a server error string.
function parseRowNo(message: string): number | null {
  const match = message.match(/^แถวที่ (\d+):/);
  return match ? Number(match[1]) : null;
}

// Searchable student picker — replaces a plain <select> that becomes
// unusable to scroll through once there are many students. Filters the
// already-loaded `students` prop client-side (no extra fetch/library).
function StudentSearchSelect({
  students,
  value,
  onChange,
}: {
  students: StudentOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = students.find((s) => s.id === value) ?? null;

  const q = query.trim().toLowerCase();
  const filtered = students
    .filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.studentId ?? "").toLowerCase().includes(q),
    )
    .slice(0, 10);

  function selectStudent(s: StudentOption) {
    onChange(s.id);
    setQuery("");
    setOpen(false);
  }

  if (selected) {
    return (
      <div className="input flex items-center justify-between gap-2">
        <span className="truncate">
          {selected.name} {selected.studentId ? `(${selected.studentId})` : ""}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
          }}
          className="shrink-0 text-xs font-medium text-(--color-secondary) hover:underline"
        >
          เปลี่ยน
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        className="input"
        placeholder="พิมพ์ชื่อหรือรหัสนักศึกษาเพื่อค้นหา..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">ไม่พบนักศึกษาที่ค้นหา</p>
          ) : (
            filtered.map((s) => (
              <button
                type="button"
                key={s.id}
                onMouseDown={(e) => {
                  // Fire before the input's onBlur so the click isn't lost
                  // to the dropdown closing first.
                  e.preventDefault();
                  selectStudent(s);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                {s.name} {s.studentId ? `(${s.studentId})` : ""}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ScheduleClient({
  initialSummary,
  students,
  rooms,
  semesters,
  initialSchedules,
  initialTotal,
}: {
  initialSummary: Summary;
  students: StudentOption[];
  rooms: RoomOption[];
  semesters: string[];
  initialSchedules: ScheduleListItem[];
  initialTotal: number;
}) {
  const [summary, setSummary] = useState(initialSummary);

  // ---- CSV/XLSX bulk import (existing) -----------------------------------
  const [file, setFile] = useState<File | null>(null);
  const [importSemester, setImportSemester] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [importRowErrors, setImportRowErrors] = useState<string[]>([]);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setImportError("กรุณาเลือกไฟล์");
      return;
    }

    setImportLoading(true);
    setImportError("");
    setImportSuccess("");
    setImportRowErrors([]);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("semester", importSemester);
    formData.append("replaceExisting", String(replaceExisting));

    const result = await importClassSchedulesAction(formData);
    setImportLoading(false);

    if (result.error) {
      setImportError(result.error);
      setImportRowErrors(result.rowErrors ?? []);
      return;
    }

    setImportSuccess(`นำเข้าสำเร็จ ${result.importedRows} แถว`);
    setImportRowErrors(result.rowErrors ?? []);
    setSummary((prev) => ({
      ...prev,
      totalSchedules: prev.totalSchedules + (result.importedRows ?? 0),
    }));
    await refreshList();
  }

  // ---- Add schedule: OCR upload or manual entry, shared review table -----
  const [addMode, setAddMode] = useState<"ocr" | "manual" | null>(null);
  const [addStudentId, setAddStudentId] = useState("");
  const [addSemester, setAddSemester] = useState("");
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [addRowErrors, setAddRowErrors] = useState<string[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);

  function startAddMode(mode: "ocr" | "manual") {
    setAddMode(mode);
    setAddError("");
    setAddSuccess("");
    setAddRowErrors([]);
    setRows(mode === "manual" ? [blankRow()] : []);
    setOcrFile(null);
  }

  function cancelAdd() {
    setAddMode(null);
    setAddStudentId("");
    setAddSemester("");
    setOcrFile(null);
    setRows([]);
    setAddError("");
    setAddSuccess("");
    setAddRowErrors([]);
  }

  async function handleOcrScan() {
    if (!ocrFile) {
      setAddError("กรุณาเลือกไฟล์รูปภาพหรือ PDF ก่อน");
      return;
    }
    setOcrLoading(true);
    setAddError("");
    setAddSuccess("");
    setAddRowErrors([]);

    try {
      const fd = new FormData();
      fd.append("file", ocrFile);
      const res = await fetch("/api/schedule/ocr", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || data.error) {
        setAddError(data.error || "อ่านตารางเรียนไม่สำเร็จ กรุณาลองใหม่");
        setOcrLoading(false);
        return;
      }

      const newRows: EditableRow[] = (data.rows as OcrApiRow[]).map((r) => ({
        key: makeKey(),
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        subjectCode: r.subjectCode || "",
        subjectName: r.subjectName || "",
        section: r.section || "",
        roomId: r.roomId || "",
        roomHint: r.roomText || "",
      }));
      setRows(newRows);
      setAddSuccess(
        `อ่านตารางเรียนสำเร็จ พบ ${newRows.length} รายวิชา — กรุณาตรวจสอบความถูกต้องของแต่ละแถวก่อนกดยืนยันบันทึก`,
      );
    } catch {
      setAddError("ไม่สามารถเชื่อมต่อบริการ OCR ได้ กรุณาลองใหม่ หรือใช้แบบ \"กรอกเอง\" แทน");
    }
    setOcrLoading(false);
  }

  function addBlankRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function updateRow(key: string, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function handleConfirmSave() {
    if (!addStudentId) {
      setAddError("กรุณาเลือกนักศึกษาเจ้าของตารางเรียนนี้");
      return;
    }
    if (!addSemester.trim()) {
      setAddError("กรุณาระบุภาคการศึกษา เช่น 2/2026");
      return;
    }
    if (rows.length === 0) {
      setAddError("กรุณาเพิ่มอย่างน้อย 1 รายวิชา");
      return;
    }

    setSaveLoading(true);
    setAddError("");

    const payload: ScheduleRowInput[] = rows.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      subjectCode: r.subjectCode,
      subjectName: r.subjectName,
      section: r.section,
      roomId: r.roomId,
    }));

    const result = await saveClassSchedulesAction({
      userId: addStudentId,
      semester: addSemester.trim(),
      rows: payload,
    });
    setSaveLoading(false);

    if (result.error) {
      setAddError(result.error);
      setAddRowErrors(result.rowErrors ?? []);
      return;
    }

    const rowErrors = result.rowErrors ?? [];
    const savedCount = result.savedCount ?? 0;
    setAddRowErrors(rowErrors);

    if (rowErrors.length === 0) {
      setAddSuccess(`บันทึกตารางเรียนสำเร็จทั้งหมด ${savedCount} รายวิชา`);
      cancelAddKeepingSuccess();
    } else {
      // Keep only the rows that failed so the admin can fix and re-submit
      // instead of retyping everything.
      const failedRowNos = new Set(
        rowErrors.map((msg) => parseRowNo(msg)).filter((n): n is number => n !== null),
      );
      const failedRows = rows.filter((_, idx) => failedRowNos.has(idx + 1));
      setRows(failedRows.length > 0 ? failedRows : rows);
      setAddSuccess(
        savedCount > 0
          ? `บันทึกสำเร็จ ${savedCount} รายวิชา ส่วนที่เหลือมีข้อผิดพลาด กรุณาตรวจสอบและแก้ไขด้านล่าง`
          : "",
      );
    }

    setSummary((prev) => ({ ...prev, totalSchedules: prev.totalSchedules + savedCount }));
    await refreshList();
  }

  function cancelAddKeepingSuccess() {
    setAddMode(null);
    setAddStudentId("");
    setAddSemester("");
    setOcrFile(null);
    setRows([]);
    setAddRowErrors([]);
  }

  // ---- List / search / edit / delete existing schedules ------------------
  const [schedules, setSchedules] = useState(initialSchedules);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  async function refreshList(
    nextPage = page,
    nextSearch = search,
    nextSemester = semesterFilter,
  ) {
    setListLoading(true);
    const result = await listClassSchedulesAction({
      page: nextPage,
      pageSize,
      search: nextSearch,
      semester: nextSemester,
    });
    setSchedules((result.schedules ?? []) as ScheduleListItem[]);
    setTotal(result.total ?? 0);
    setListLoading(false);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
    refreshList(1, searchInput, semesterFilter);
  }

  function handleSemesterFilterChange(value: string) {
    setSemesterFilter(value);
    setPage(1);
    refreshList(1, search, value);
  }

  function handlePageChange(p: number) {
    setPage(p);
    refreshList(p, search, semesterFilter);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subjectCode: string;
    subjectName: string;
    section: string;
    roomId: string;
    semester: string;
  } | null>(null);

  function startEditItem(item: ScheduleListItem) {
    setEditingId(item.id);
    setEditForm({
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      endTime: item.endTime,
      subjectCode: item.subjectCode ?? "",
      subjectName: item.subjectName ?? "",
      section: item.section ?? "",
      roomId: item.room.id,
      semester: item.semester ?? "",
    });
    setListError("");
  }

  function cancelEditItem() {
    setEditingId(null);
    setEditForm(null);
  }

  async function saveEditItem() {
    if (!editingId || !editForm) return;
    setListLoading(true);
    const result = await updateClassScheduleAction(editingId, editForm);
    if (result.error) {
      setListLoading(false);
      setListError(result.error);
      return;
    }
    setListError("");
    setEditingId(null);
    setEditForm(null);
    await refreshList();
  }

  async function deleteItem(id: string) {
    if (!confirm("ยืนยันการลบตารางเรียนรายการนี้?")) return;
    const result = await deleteClassScheduleAction(id);
    if (result.error) {
      setListError(result.error);
      return;
    }
    setListError("");
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
    setSummary((prev) => ({ ...prev, totalSchedules: Math.max(0, prev.totalSchedules - 1) }));
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <p className="text-sm text-gray-500 -mt-4">
        ดู เพิ่ม แก้ไข และลบตารางเรียนของนักศึกษา — อัพโหลดรูป/ไฟล์เพื่ออ่านด้วย AI (OCR), กรอกเอง,
        หรือนำเข้าเป็นชุดจาก CSV/XLSX
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs text-gray-500">ตารางเรียนทั้งหมด</p>
          <p className="text-2xl font-semibold mt-1">{summary.totalSchedules}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">นักศึกษาที่มีตาราง</p>
          <p className="text-2xl font-semibold mt-1">{summary.totalStudents}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">ห้องที่มีการใช้งาน</p>
          <p className="text-2xl font-semibold mt-1">{summary.totalRooms}</p>
        </div>
      </div>

      {/* ============ Add schedule: OCR upload / manual entry ============ */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-gray-700" />
          <h2 className="font-semibold text-lg">เพิ่มตารางเรียน</h2>
        </div>

        {addMode === null && (
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => startAddMode("ocr")}>
              <ScanLine className="h-4 w-4" />
              อัพโหลดรูป/ไฟล์ (อ่านด้วย AI)
            </button>
            <button className="btn-secondary" onClick={() => startAddMode("manual")}>
              <ClipboardEdit className="h-4 w-4" />
              กรอกเอง (ไม่อัพโหลด)
            </button>
          </div>
        )}

        {addMode !== null && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">นักศึกษาเจ้าของตารางเรียน</label>
                <StudentSearchSelect
                  students={students}
                  value={addStudentId}
                  onChange={setAddStudentId}
                />
              </div>
              <div>
                <label className="label">ภาคการศึกษา</label>
                <input
                  className="input"
                  placeholder="เช่น 2/2026"
                  list="semester-suggestions"
                  value={addSemester}
                  onChange={(e) => setAddSemester(e.target.value)}
                />
                <datalist id="semester-suggestions">
                  {semesters.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>

            {addMode === "ocr" && (
              <div className="space-y-3">
                <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-sm text-gray-600 hover:bg-gray-100">
                  <FileSpreadsheet className="h-5 w-5" />
                  <span>{ocrFile ? ocrFile.name : "คลิกเพื่อเลือกรูปภาพหรือ PDF ของตารางเรียน"}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    onChange={(e) => setOcrFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="btn-primary"
                    onClick={handleOcrScan}
                    disabled={ocrLoading || !ocrFile}
                  >
                    {ocrLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ScanLine className="h-4 w-4" />
                    )}
                    {ocrLoading ? "กำลังอ่านตารางเรียนด้วย AI..." : "สแกนและอ่านตารางเรียน"}
                  </button>
                  <p className="text-xs text-gray-500">รองรับ JPG, PNG, WEBP, GIF, PDF (สูงสุด 10MB)</p>
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 pr-2">วัน</th>
                        <th className="pb-2 pr-2">เริ่ม</th>
                        <th className="pb-2 pr-2">สิ้นสุด</th>
                        <th className="pb-2 pr-2">รหัสวิชา</th>
                        <th className="pb-2 pr-2">ชื่อวิชา</th>
                        <th className="pb-2 pr-2">Section</th>
                        <th className="pb-2 pr-2">ห้อง</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-2">
                            <select
                              className="input py-1.5"
                              value={row.dayOfWeek}
                              onChange={(e) =>
                                updateRow(row.key, { dayOfWeek: Number(e.target.value) })
                              }
                            >
                              {DAY_LABELS.map((label, idx) => (
                                <option key={label} value={idx}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              type="time"
                              className="input py-1.5"
                              value={row.startTime}
                              onChange={(e) => updateRow(row.key, { startTime: e.target.value })}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              type="time"
                              className="input py-1.5"
                              value={row.endTime}
                              onChange={(e) => updateRow(row.key, { endTime: e.target.value })}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              type="text"
                              className="input py-1.5 w-28"
                              placeholder="CS101"
                              value={row.subjectCode}
                              onChange={(e) => updateRow(row.key, { subjectCode: e.target.value })}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              type="text"
                              className="input py-1.5 min-w-[10rem]"
                              placeholder="ชื่อวิชา"
                              value={row.subjectName}
                              onChange={(e) => updateRow(row.key, { subjectName: e.target.value })}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              type="text"
                              className="input py-1.5 w-24"
                              placeholder="327A"
                              value={row.section}
                              onChange={(e) => updateRow(row.key, { section: e.target.value })}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <select
                              className="input py-1.5"
                              value={row.roomId}
                              onChange={(e) => updateRow(row.key, { roomId: e.target.value })}
                            >
                              <option value="">-- เลือกห้อง --</option>
                              {rooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.roomCode} — {r.name}
                                </option>
                              ))}
                            </select>
                            {!row.roomId && row.roomHint && (
                              <p className="text-xs text-amber-600 mt-1">
                                AI พบข้อความ &quot;{row.roomHint}&quot; กรุณาเลือกห้องที่ตรงกัน
                              </p>
                            )}
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => removeRow(row.key)}
                              className="p-1.5 text-gray-400 hover:text-red-600"
                              title="ลบแถวนี้"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button type="button" className="btn-secondary" onClick={addBlankRow}>
                  <Plus className="h-4 w-4" />
                  เพิ่มแถว
                </button>
              </div>
            )}

            {rows.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <button
                  className="btn-success"
                  onClick={handleConfirmSave}
                  disabled={saveLoading}
                >
                  {saveLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {saveLoading ? "กำลังบันทึก..." : "ยืนยันบันทึก"}
                </button>
                <button className="btn-secondary" onClick={cancelAdd} disabled={saveLoading}>
                  <X className="h-4 w-4" />
                  ยกเลิก
                </button>
              </div>
            )}

            {rows.length === 0 && addMode === "ocr" && (
              <button className="btn-secondary" onClick={cancelAdd}>
                <X className="h-4 w-4" />
                ยกเลิก
              </button>
            )}
          </div>
        )}

        {addError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{addError}</span>
          </div>
        )}
        {addSuccess && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{addSuccess}</span>
          </div>
        )}
        {addRowErrors.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800 mb-1">
              รายการที่ยังไม่ผ่านการตรวจสอบ (แก้ไขแล้วกดยืนยันบันทึกอีกครั้ง)
            </p>
            <ul className="list-disc pl-5 text-sm text-amber-700 space-y-0.5">
              {addRowErrors.map((err, idx) => (
                <li key={`${err}-${idx}`}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ============ List / search / edit / delete existing rows ============ */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-gray-700" />
          <h2 className="font-semibold text-lg">ตารางเรียนทั้งหมด</h2>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              className="input pl-9"
              placeholder="ค้นหาชื่อ/รหัสนักศึกษา, รหัสวิชา, ชื่อวิชา, ห้อง..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <select
            className="input sm:w-48"
            value={semesterFilter}
            onChange={(e) => handleSemesterFilterChange(e.target.value)}
          >
            <option value="">ทุกภาคการศึกษา</option>
            {semesters.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            <Search className="h-4 w-4" />
            ค้นหา
          </button>
        </form>

        {listError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{listError}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-3">นักศึกษา</th>
                <th className="pb-2 pr-3">วัน</th>
                <th className="pb-2 pr-3">เวลา</th>
                <th className="pb-2 pr-3">วิชา</th>
                <th className="pb-2 pr-3">Section</th>
                <th className="pb-2 pr-3">ห้อง</th>
                <th className="pb-2 pr-3">ภาคการศึกษา</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((item) =>
                editingId === item.id && editForm ? (
                  <tr key={item.id} className="border-b last:border-0 align-top bg-blue-50/40">
                    <td className="py-2 pr-3 font-medium">
                      {item.user.name}
                      {item.user.studentId ? ` (${item.user.studentId})` : ""}
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        className="input py-1.5"
                        value={editForm.dayOfWeek}
                        onChange={(e) =>
                          setEditForm({ ...editForm, dayOfWeek: Number(e.target.value) })
                        }
                      >
                        {DAY_LABELS.map((label, idx) => (
                          <option key={label} value={idx}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          className="input py-1.5"
                          value={editForm.startTime}
                          onChange={(e) =>
                            setEditForm({ ...editForm, startTime: e.target.value })
                          }
                        />
                        <span>-</span>
                        <input
                          type="time"
                          className="input py-1.5"
                          value={editForm.endTime}
                          onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        className="input py-1.5 w-24 mb-1"
                        placeholder="รหัสวิชา"
                        value={editForm.subjectCode}
                        onChange={(e) =>
                          setEditForm({ ...editForm, subjectCode: e.target.value })
                        }
                      />
                      <input
                        type="text"
                        className="input py-1.5 min-w-[9rem]"
                        placeholder="ชื่อวิชา"
                        value={editForm.subjectName}
                        onChange={(e) =>
                          setEditForm({ ...editForm, subjectName: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        className="input py-1.5 w-20"
                        value={editForm.section}
                        onChange={(e) => setEditForm({ ...editForm, section: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        className="input py-1.5"
                        value={editForm.roomId}
                        onChange={(e) => setEditForm({ ...editForm, roomId: e.target.value })}
                      >
                        <option value="">-- เลือกห้อง --</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.roomCode}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        className="input py-1.5 w-24"
                        value={editForm.semester}
                        onChange={(e) => setEditForm({ ...editForm, semester: e.target.value })}
                      />
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={saveEditItem}
                          className="p-1.5 text-gray-400 hover:text-green-600"
                          disabled={listLoading}
                          title="บันทึก"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={cancelEditItem}
                          className="p-1.5 text-gray-400 hover:text-red-600"
                          title="ยกเลิก"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      {item.user.name}
                      {item.user.studentId ? ` (${item.user.studentId})` : ""}
                    </td>
                    <td className="py-2 pr-3">{DAY_LABELS[item.dayOfWeek] ?? item.dayOfWeek}</td>
                    <td className="py-2 pr-3">
                      {item.startTime} - {item.endTime}
                    </td>
                    <td className="py-2 pr-3">
                      {item.subjectCode ?? "-"}
                      {item.subjectName ? ` | ${item.subjectName}` : ""}
                    </td>
                    <td className="py-2 pr-3">{item.section ?? "-"}</td>
                    <td className="py-2 pr-3">{item.room.roomCode}</td>
                    <td className="py-2 pr-3">{item.semester ?? "-"}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEditItem(item)}
                          className="p-1.5 text-gray-400 hover:text-(--color-secondary)"
                          title="แก้ไข"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600"
                          title="ลบ"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>

          {schedules.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              {listLoading ? "กำลังโหลด..." : "ยังไม่มีข้อมูลตารางเรียน"}
            </div>
          )}
        </div>

        {total > pageSize && (
          <div className="flex items-center justify-between text-sm text-gray-500 pt-2">
            <span>
              หน้า {page} จาก {totalPages} ({total} รายการ)
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary py-1.5 px-3"
                disabled={page <= 1 || listLoading}
                onClick={() => handlePageChange(page - 1)}
              >
                ก่อนหน้า
              </button>
              <button
                className="btn-secondary py-1.5 px-3"
                disabled={page >= totalPages || listLoading}
                onClick={() => handlePageChange(page + 1)}
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============ Bulk CSV/XLSX import (existing) ============ */}
      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold text-lg mb-1">นำเข้าจากไฟล์ CSV/XLSX (แบบชุด)</h2>
          <p className="text-sm text-gray-500">
            รองรับไฟล์ CSV/XLSX โดยต้องมีคอลัมน์: studentId, roomCode, dayOfWeek,
            startTime, endTime, section, subjectCode
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href="/templates/class-schedule-template.csv"
              download
              className="btn-secondary"
            >
              <Download className="h-4 w-4" />
              ดาวน์โหลดไฟล์ตัวอย่าง (CSV)
            </a>
            <p className="text-xs text-gray-500">
              dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat และเวลาใช้รูปแบบ HH:MM
            </p>
          </div>
        </div>

        <form onSubmit={handleImport} className="space-y-4">
          <div>
            <label className="label">ไฟล์ตารางเรียน (CSV/XLSX)</label>
            <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-sm text-gray-600 hover:bg-gray-100">
              <FileSpreadsheet className="h-5 w-5" />
              <span>{file ? file.name : "คลิกเพื่อเลือกไฟล์"}</span>
              <input
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">ภาคการศึกษา</label>
              <input
                className="input"
                placeholder="เช่น 2/2026"
                value={importSemester}
                onChange={(e) => setImportSemester(e.target.value)}
                required
              />
            </div>
            <label className="flex items-center gap-2 mt-7 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              ลบข้อมูลเดิมก่อนนำเข้า
            </label>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={importLoading || !file}
          >
            <Upload className="h-4 w-4" />
            {importLoading ? "กำลังนำเข้า..." : "นำเข้าตารางเรียน"}
          </button>
        </form>

        {importError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{importError}</span>
          </div>
        )}

        {importSuccess && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5" />
            <span>{importSuccess}</span>
          </div>
        )}

        {importRowErrors.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2 text-sm">
              ข้อผิดพลาดจากการนำเข้า (สูงสุด 30 รายการ)
            </h3>
            <ul className="list-disc pl-6 text-sm text-red-700 space-y-1">
              {importRowErrors.map((rowError, idx) => (
                <li key={`${rowError}-${idx}`}>{rowError}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
