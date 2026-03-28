"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import {
  QrCode,
  DoorOpen,
  Users,
  Clock,
  Plus,
  Copy,
  Check,
  Eye,
  X,
  ChevronRight,
  Camera,
  ScanFace,
  CheckCircle2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { getAvailableRoomsAction } from "@/actions/rooms";
import {
  generateAccessTokenAction,
  getMyTokensAction,
} from "@/actions/access-tokens";
import {
  createGroupAction,
  joinGroupAction,
  getMyGroupsAction,
  generateGroupTokenAction,
} from "@/actions/groups";
import { getFaceStatusAction, deleteFaceProfileAction } from "@/actions/face";
import {
  getProfileAction,
  setStudentIdFirstLoginAction,
} from "@/actions/profile";
import { getMyClassSchedulesAction } from "@/actions/class-schedules";
import type { AuthUser } from "@/lib/types";
import QRCode from "qrcode";

interface Room {
  id: string;
  name: string;
  roomCode: string;
  description: string | null;
  capacity: number;
  guestAccess: boolean;
}

function parseRoomCode(roomCode: string): { building: string; floor: string } {
  const normalized = roomCode.trim().toUpperCase();
  const match = normalized.match(/^([A-Z]\d)-([1-9])\d{2}$/);
  if (!match) {
    return { building: "OTHER", floor: "OTHER" };
  }

  return {
    building: match[1],
    floor: match[2],
  };
}

const dayLabel: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

const ENABLE_GROUP_UI = false;

function toDateTimeLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function DashboardClient({ user }: { user: AuthUser }) {
  const minDateTime = new Date(Date.now() + 60_000).toISOString().slice(0, 16);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [tokens, setTokens] = useState<
    Array<{
      id: string;
      token: string;
      validFrom: Date;
      validTo: Date;
      room: { name: string; roomCode: string };
      group: { name: string } | null;
    }>
  >([]);
  const [groups, setGroups] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      owner: { id: string; name: string };
      members: Array<{ user: { id: string; name: string; email: string } }>;
      _count: { members: number };
    }>
  >([]);

  // Modal states
  const [showGenerateQR, setShowGenerateQR] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showJoinGroup, setShowJoinGroup] = useState(false);
  const [showGroupQR, setShowGroupQR] = useState(false);

  // Form states
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");

  // QR states
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [generatedToken, setGeneratedToken] = useState("");
  const [copied, setCopied] = useState(false);

  // View existing token states
  const [viewingToken, setViewingToken] = useState<{
    id: string;
    token: string;
    room: { name: string; roomCode: string };
    group: { name: string } | null;
    validFrom: Date;
    validTo: Date;
  } | null>(null);
  const [viewQrDataUrl, setViewQrDataUrl] = useState("");

  // Face enrollment states
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [faceEnrolledAt, setFaceEnrolledAt] = useState<Date | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [faceStream, setFaceStream] = useState<MediaStream | null>(null);
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [studentId, setStudentId] = useState<string | null>(
    user.studentId ?? null,
  );
  const [studentIdInput, setStudentIdInput] = useState("");
  const [pendingStudentId, setPendingStudentId] = useState("");
  const [showStudentIdConfirm, setShowStudentIdConfirm] = useState(false);
  const [mySchedules, setMySchedules] = useState<
    Array<{
      id: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      section: string | null;
      subjectName: string | null;
      subjectCode: string | null;
      semester: string | null;
      room: { roomCode: string; name: string };
    }>
  >([]);

  const buildingOptions = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((room) => {
      set.add(parseRoomCode(room.roomCode).building);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rooms]);

  const floorOptions = useMemo(() => {
    if (!selectedBuilding) return [];
    const set = new Set<string>();
    rooms.forEach((room) => {
      const parsed = parseRoomCode(room.roomCode);
      if (parsed.building === selectedBuilding) {
        set.add(parsed.floor);
      }
    });
    return [...set].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [rooms, selectedBuilding]);

  const filteredRooms = useMemo(() => {
    if (!selectedBuilding || !selectedFloor) return [];
    return rooms
      .filter((room) => {
        const parsed = parseRoomCode(room.roomCode);
        return (
          parsed.building === selectedBuilding && parsed.floor === selectedFloor
        );
      })
      .sort((a, b) => a.roomCode.localeCompare(b.roomCode));
  }, [rooms, selectedBuilding, selectedFloor]);

  async function loadData() {
    const [roomsRes, tokensRes, groupsRes] = await Promise.all([
      getAvailableRoomsAction(),
      getMyTokensAction(),
      getMyGroupsAction(),
    ]);
    setRooms(roomsRes.rooms);
    setTokens(tokensRes.tokens as typeof tokens);
    setGroups(groupsRes.groups as typeof groups);
  }

  async function loadStudentMeta() {
    if (user.role !== "STUDENT") return;

    const profileRes = await getProfileAction();
    if (profileRes.user) {
      setStudentId(profileRes.user.studentId || null);
    }

    const scheduleRes = await getMyClassSchedulesAction();
    setMySchedules(scheduleRes.schedules as typeof mySchedules);
  }

  async function loadFaceStatus() {
    if (user.role === "GUEST") return;
    const res = await getFaceStatusAction();
    setFaceEnrolled(res.enrolled);
    if (res.faceProfile?.createdAt) {
      setFaceEnrolledAt(new Date(res.faceProfile.createdAt));
    }
  }

  useEffect(() => {
    loadData();
    loadFaceStatus();
    loadStudentMeta();
  }, []);

  function handleStudentIdSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const normalized = studentIdInput.trim();
    if (!/^\d{10}$/.test(normalized)) {
      setError("รหัสนักศึกษาต้องเป็นตัวเลข 10 หลัก");
      return;
    }

    setPendingStudentId(normalized);
    setShowStudentIdConfirm(true);
  }

  async function handleConfirmStudentId() {
    if (!pendingStudentId) return;

    setLoading(true);
    setError("");
    const result = await setStudentIdFirstLoginAction({
      studentId: pendingStudentId,
    });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setStudentId(pendingStudentId);
    setStudentIdInput("");
    setPendingStudentId("");
    setShowStudentIdConfirm(false);
    setSuccess("บันทึกรหัสนักศึกษาเรียบร้อยแล้ว");
    loadStudentMeta();
  }

  async function startFaceCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      setFaceStream(stream);
      if (faceVideoRef.current) {
        faceVideoRef.current.srcObject = stream;
      }
    } catch {
      setError("ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง");
    }
  }

  function stopFaceCamera() {
    if (faceStream) {
      faceStream.getTracks().forEach((t) => t.stop());
      setFaceStream(null);
    }
  }

  function captureFrame() {
    if (!faceVideoRef.current || !faceCanvasRef.current) return;
    const video = faceVideoRef.current;
    const canvas = faceCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedImages((prev) => [...prev, dataUrl].slice(0, 3));
  }

  async function handleFaceEnroll() {
    if (capturedImages.length === 0) {
      setError("กรุณาถ่ายรูปอย่างน้อย 1 รูป");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/face/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images_base64: capturedImages }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("ลงทะเบียนใบหน้าสำเร็จ! ✅");
        setFaceEnrolled(true);
        setFaceEnrolledAt(new Date());
        stopFaceCamera();
        setShowFaceEnroll(false);
        setCapturedImages([]);
      } else {
        setError(data.error || data.message || "ลงทะเบียนไม่สำเร็จ");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อ AI Service ได้");
    }
    setLoading(false);
  }

  async function handleDeleteFace() {
    if (!confirm("ยืนยันการลบข้อมูลใบหน้า? จะต้องลงทะเบียนใหม่")) return;
    const res = await deleteFaceProfileAction();
    if (res.success) {
      setFaceEnrolled(false);
      setFaceEnrolledAt(null);
      setSuccess("ลบข้อมูลใบหน้าแล้ว");
    } else {
      setError(res.error || "ลบไม่สำเร็จ");
    }
  }

  async function handleGenerateQR(e: React.FormEvent) {
    e.preventDefault();

    const start = new Date(validFrom);
    const end = new Date(validTo);
    const now = new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("รูปแบบวันเวลาไม่ถูกต้อง");
      return;
    }

    if (start <= now) {
      setError("เวลาลงทะเบียนต้องเป็นเวลาล่วงหน้าอย่างน้อย 1 นาที");
      return;
    }

    if (end <= start) {
      setError("เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น");
      return;
    }

    setLoading(true);
    setError("");

    const result = await generateAccessTokenAction({
      roomId: selectedRoom,
      validFrom,
      validTo,
    });

    if (result.error) {
      setError(result.error);
    } else if (result.token) {
      setGeneratedToken(result.token);
      const url = await QRCode.toDataURL(result.token, {
        width: 300,
        margin: 2,
      });
      setQrDataUrl(url);
      setSuccess("สร้าง QR Code สำเร็จ!");
      loadData();
    }

    setLoading(false);
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await createGroupAction({ name: groupName });
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("สร้างกลุ่มสำเร็จ!");
      setShowCreateGroup(false);
      setGroupName("");
      loadData();
    }
    setLoading(false);
  }

  async function handleJoinGroup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await joinGroupAction(groupCode);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(`เข้าร่วมกลุ่ม "${result.groupName}" สำเร็จ!`);
      setShowJoinGroup(false);
      setGroupCode("");
      loadData();
    }
    setLoading(false);
  }

  async function handleGenerateGroupQR(e: React.FormEvent) {
    e.preventDefault();

    const start = new Date(validFrom);
    const end = new Date(validTo);
    const now = new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("รูปแบบวันเวลาไม่ถูกต้อง");
      return;
    }

    if (start <= now) {
      setError("เวลาลงทะเบียนต้องเป็นเวลาล่วงหน้าอย่างน้อย 1 นาที");
      return;
    }

    if (end <= start) {
      setError("เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น");
      return;
    }

    setLoading(true);
    setError("");

    const result = await generateGroupTokenAction({
      groupId: selectedGroup,
      roomId: selectedRoom,
      validFrom,
      validTo,
    });

    if (result.error) {
      setError(result.error);
    } else if (result.token) {
      setGeneratedToken(result.token);
      const url = await QRCode.toDataURL(result.token, {
        width: 300,
        margin: 2,
      });
      setQrDataUrl(url);
      setSuccess("สร้าง Group QR Code สำเร็จ!");
      loadData();
    }
    setLoading(false);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const handleViewToken = useCallback(
    async (token: (typeof tokens)[number]) => {
      const url = await QRCode.toDataURL(token.token, {
        width: 300,
        margin: 2,
      });
      setViewQrDataUrl(url);
      setViewingToken(token);
    },
    [],
  );

  function closeViewToken() {
    setViewingToken(null);
    setViewQrDataUrl("");
  }

  function openGenerateRequestModal() {
    const now = new Date();
    const start = new Date(now.getTime() + 5 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    setShowGenerateQR(true);
    setShowGroupQR(false);
    setSelectedBuilding("");
    setSelectedFloor("");
    setSelectedRoom("");
    setQrDataUrl("");
    setGeneratedToken("");
    setValidFrom(toDateTimeLocal(start));
    setValidTo(toDateTimeLocal(end));
  }

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          สวัสดี, {user.name}
        </h1>
        <p className="text-gray-500 mt-1">
          บทบาท:{" "}
          <span
            className={
              user.role === "STUDENT" ? "badge-student" : "badge-guest"
            }
          >
            {user.role}
          </span>
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-(--color-secondary)/20 bg-linear-to-r from-(--color-secondary)/8 to-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              พร้อมเข้าห้องแล้วใช่ไหม?
            </p>
            <p className="text-sm text-gray-600">
              กดครั้งเดียวเพื่อสร้างคำขอเข้าใช้ห้อง
              พร้อมกำหนดเวลาเริ่มต้นให้อัตโนมัติ
            </p>
          </div>
          <button
            onClick={openGenerateRequestModal}
            className="btn-primary whitespace-nowrap"
          >
            <QrCode className="h-4 w-4" />
            ขอเข้าใช้ห้องทันที
          </button>
        </div>
      </div>

      {user.role === "STUDENT" && !studentId && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            เชื่อมต่อบัญชีกับตารางเรียนของคุณ
          </p>
          <p className="mt-1 text-sm text-amber-800">
            กรุณากรอกรหัสนักศึกษา 10
            หลักครั้งแรกเพื่อเปิดใช้งานสิทธิ์เข้าห้องตามตารางเรียน
            หากกรอกผิดหรือรหัสซ้ำ กรุณาติดต่อแอดมิน
          </p>
          <form
            onSubmit={handleStudentIdSubmit}
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <input
              type="text"
              className="input sm:max-w-xs"
              placeholder="กรอกรหัสนักศึกษา 10 หลัก"
              value={studentIdInput}
              onChange={(e) =>
                setStudentIdInput(
                  e.target.value.replace(/\D/g, "").slice(0, 10),
                )
              }
              inputMode="numeric"
              maxLength={10}
              required
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              ยืนยันรหัสนักศึกษา
            </button>
          </form>
        </div>
      )}

      {showStudentIdConfirm && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">
            ยืนยันอีกครั้ง: รหัสนักศึกษา {pendingStudentId} ถูกต้องใช่ไหม
          </p>
          <p className="mt-1 text-sm text-gray-600">
            บันทึกแล้วจะไม่สามารถแก้ไขเองได้ หากผิดกรุณาติดต่อแอดมิน
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={loading}
              onClick={handleConfirmStudentId}
            >
              {loading ? "กำลังบันทึก..." : "ยืนยันและบันทึก"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowStudentIdConfirm(false);
                setPendingStudentId("");
              }}
            >
              ย้อนกลับ
            </button>
          </div>
        </div>
      )}

      {user.role === "STUDENT" && studentId && (
        <div className="card mb-8">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">ตารางเรียนของฉัน</h2>
            <p className="text-xs text-gray-500">Student ID: {studentId}</p>
          </div>

          {mySchedules.length === 0 ? (
            <p className="text-sm text-gray-500">
              ยังไม่มีข้อมูลตารางเรียนของคุณในระบบ
            </p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {mySchedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="rounded-xl border border-gray-200 bg-white p-3"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {schedule.subjectCode ?? "-"}
                      </p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {dayLabel[schedule.dayOfWeek] ?? schedule.dayOfWeek}
                      </span>
                    </div>
                    {schedule.subjectName && (
                      <p className="mb-2 text-xs text-gray-500">
                        {schedule.subjectName}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      <p className="text-gray-700">
                        <span className="font-medium text-gray-900">เวลา:</span>{" "}
                        {schedule.startTime} - {schedule.endTime}
                      </p>
                      <p className="text-gray-700">
                        <span className="font-medium text-gray-900">
                          Section:
                        </span>{" "}
                        {schedule.section ?? "-"}
                      </p>
                      <p className="text-gray-700">
                        <span className="font-medium text-gray-900">ห้อง:</span>{" "}
                        {schedule.room.roomCode}
                      </p>
                      <p className="text-gray-700">
                        <span className="font-medium text-gray-900">เทอม:</span>{" "}
                        {schedule.semester ?? "-"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-3">วัน</th>
                      <th className="pb-2 pr-3">เวลา</th>
                      <th className="pb-2 pr-3">วิชา</th>
                      <th className="pb-2 pr-3">Section</th>
                      <th className="pb-2 pr-3">ห้อง</th>
                      <th className="pb-2">เทอม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mySchedules.map((schedule) => (
                      <tr key={schedule.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">
                          {dayLabel[schedule.dayOfWeek] ?? schedule.dayOfWeek}
                        </td>
                        <td className="py-2 pr-3">
                          {schedule.startTime} - {schedule.endTime}
                        </td>
                        <td className="py-2 pr-3">
                          {schedule.subjectCode ?? "-"}
                          {schedule.subjectName
                            ? ` | ${schedule.subjectName}`
                            : ""}
                        </td>
                        <td className="py-2 pr-3">{schedule.section ?? "-"}</td>
                        <td className="py-2 pr-3">{schedule.room.roomCode}</td>
                        <td className="py-2">{schedule.semester ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError("")}
            className="float-right font-bold"
          >
            ×
          </button>
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {success}
          <button
            onClick={() => setSuccess("")}
            className="float-right font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Face Enrollment Section — STUDENT+ only */}
      {user.role !== "GUEST" && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl ${faceEnrolled ? "bg-green-50" : "bg-(--color-primary-light)"}`}
              >
                <ScanFace
                  className={`h-6 w-6 ${faceEnrolled ? "text-green-600" : "text-(--color-primary)"}`}
                />
              </div>
              <div>
                <h2 className="font-semibold">ระบบสแกนใบหน้า</h2>
                <p className="text-sm text-gray-500">
                  {faceEnrolled
                    ? `ลงทะเบียนแล้ว${faceEnrolledAt ? ` — ${faceEnrolledAt.toLocaleDateString("th-TH")}` : ""}`
                    : "ยังไม่ได้ลงทะเบียน"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {faceEnrolled ? (
                <>
                  <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Enrolled
                  </span>
                  <button
                    onClick={() => {
                      setShowFaceEnroll(true);
                      setCapturedImages([]);
                      setTimeout(startFaceCamera, 300);
                    }}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    <RefreshCw className="h-3 w-3" />
                    ลงทะเบียนใหม่
                  </button>
                  <button
                    onClick={handleDeleteFace}
                    className="text-red-400 hover:text-red-600 p-1.5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowFaceEnroll(true);
                    setCapturedImages([]);
                    setTimeout(startFaceCamera, 300);
                  }}
                  className="btn-primary text-sm"
                >
                  <Camera className="h-4 w-4" />
                  ลงทะเบียนใบหน้า
                </button>
              )}
            </div>
          </div>

          {/* Face Enrollment Modal */}
          {showFaceEnroll && (
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Camera */}
                <div>
                  <div className="relative bg-black rounded-xl overflow-hidden aspect-4/3">
                    <video
                      ref={faceVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: "scaleX(-1)" }}
                    />
                    {/* Face guide overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-60 border-2 border-white/40 rounded-[50%]" />
                    </div>
                  </div>
                  <canvas ref={faceCanvasRef} className="hidden" />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={captureFrame}
                      disabled={!faceStream || capturedImages.length >= 3}
                      className="btn-primary flex-1"
                    >
                      <Camera className="h-4 w-4" />
                      ถ่ายรูป ({capturedImages.length}/3)
                    </button>
                    <button
                      onClick={() => {
                        stopFaceCamera();
                        setShowFaceEnroll(false);
                        setCapturedImages([]);
                      }}
                      className="btn-secondary"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>

                {/* Captured images preview */}
                <div>
                  <p className="text-sm font-medium mb-2">
                    รูปที่ถ่ายไว้ ({capturedImages.length}/3)
                  </p>
                  <p className="text-xs text-gray-500 mb-3">
                    ถ่าย 2–3 รูป จากมุมต่างกันเล็กน้อยเพื่อความแม่นยำ
                  </p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="aspect-square bg-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-200 flex items-center justify-center"
                      >
                        {capturedImages[i] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={capturedImages[i]} // Base64 data URL
                            alt={`Capture ${i + 1}`}
                            className="w-full h-full object-cover"
                            style={{ transform: "scaleX(-1)" }} // Mirror image (เพราะกล้องหน้า)
                          />
                        ) : (
                          <Camera className="h-6 w-6 text-gray-300" />
                        )}
                      </div>
                    ))}
                  </div>
                  {capturedImages.length > 0 && (
                    <div className="space-y-2">
                      <button
                        onClick={handleFaceEnroll}
                        disabled={loading}
                        className="btn-success w-full"
                      >
                        <ScanFace className="h-4 w-4" />
                        {loading ? "กำลังประมวลผล..." : "ลงทะเบียนใบหน้า"}
                      </button>
                      <button
                        onClick={() => setCapturedImages([])}
                        className="btn-secondary w-full text-sm"
                      >
                        ถ่ายใหม่ทั้งหมด
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div
        className={`grid grid-cols-1 ${ENABLE_GROUP_UI ? "md:grid-cols-3" : "md:grid-cols-1"} gap-4 mb-8`}
      >
        <button
          onClick={openGenerateRequestModal}
          className={`card text-left hover:shadow-md transition-shadow ${!ENABLE_GROUP_UI ? "px-4 py-4 sm:max-w-xl" : ""}`}
        >
          <QrCode className="mb-2 h-6 w-6 text-(--color-secondary)" />
          <h3 className="font-semibold">ขอเข้าใช้ห้อง</h3>
          <p className="text-sm text-gray-500 mt-1">
            สร้าง QR สำหรับยืนยันสิทธิ์หน้าเครื่องประตู
          </p>
        </button>

        {ENABLE_GROUP_UI && (
          <>
            <button
              onClick={() => setShowCreateGroup(true)}
              className="card hover:shadow-md transition-shadow text-left"
            >
              <Users className="h-8 w-8 text-green-600 mb-3" />
              <h3 className="font-semibold">สร้างกลุ่ม</h3>
              <p className="text-sm text-gray-500 mt-1">
                สร้างกลุ่มสำหรับเข้าห้องพร้อมกัน
              </p>
            </button>

            <button
              onClick={() => setShowJoinGroup(true)}
              className="card hover:shadow-md transition-shadow text-left"
            >
              <Plus className="h-8 w-8 text-purple-600 mb-3" />
              <h3 className="font-semibold">เข้าร่วมกลุ่ม</h3>
              <p className="text-sm text-gray-500 mt-1">
                ใช้ code เพื่อเข้าร่วมกลุ่ม
              </p>
            </button>
          </>
        )}
      </div>

      {/* Generate QR Modal */}
      {showGenerateQR && (
        <div className="card mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">
              <QrCode className="inline h-5 w-5 mr-2" />
              ขอเข้าใช้ห้อง
            </h2>
            <button
              onClick={() => setShowGenerateQR(false)}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>

          {qrDataUrl ? (
            <div className="text-center">
              <Image
                src={qrDataUrl}
                alt="QR Code"
                width={300}
                height={300}
                className="mx-auto mb-4"
              />
              <div className="flex items-center justify-center gap-2 mb-4">
                <code className="text-xs bg-gray-100 px-3 py-1 rounded">
                  {generatedToken}
                </code>
                <button
                  onClick={() => copyToClipboard(generatedToken)}
                  className="btn-secondary text-xs py-1 px-2"
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
              <button
                onClick={() => {
                  setQrDataUrl("");
                  setGeneratedToken("");
                }}
                className="btn-secondary"
              >
                สร้างอีกครั้ง
              </button>
            </div>
          ) : (
            <form onSubmit={handleGenerateQR} className="space-y-4">
              <div>
                <label className="label">เลือกอาคาร</label>
                <select
                  className="input"
                  value={selectedBuilding}
                  onChange={(e) => {
                    setSelectedBuilding(e.target.value);
                    setSelectedFloor("");
                    setSelectedRoom("");
                  }}
                  required
                >
                  <option value="">-- เลือกอาคาร --</option>
                  {buildingOptions.map((building) => (
                    <option key={building} value={building}>
                      {building}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">เลือกชั้น</label>
                <select
                  className="input"
                  value={selectedFloor}
                  onChange={(e) => {
                    setSelectedFloor(e.target.value);
                    setSelectedRoom("");
                  }}
                  disabled={!selectedBuilding}
                  required
                >
                  <option value="">-- เลือกชั้น --</option>
                  {floorOptions.map((floor) => (
                    <option key={floor} value={floor}>
                      {floor === "OTHER" ? "OTHER" : `ชั้น ${floor}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">เลือกห้อง</label>
                <select
                  className="input"
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  disabled={!selectedFloor}
                  required
                >
                  <option value="">-- เลือกห้อง --</option>
                  {filteredRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} ({room.roomCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">เริ่มต้น</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    min={minDateTime}
                    required
                  />
                </div>
                <div>
                  <label className="label">สิ้นสุด</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                    min={validFrom || minDateTime}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                แนะนำ: ระบบตั้งค่าเริ่มในอีก 5 นาที และสิ้นสุด 1
                ชั่วโมงให้อัตโนมัติ (ปรับเองได้)
              </p>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading}
              >
                {loading ? "กำลังสร้าง..." : "สร้าง QR Code"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Create Group Modal */}
      {ENABLE_GROUP_UI && showCreateGroup && (
        <div className="card mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">สร้างกลุ่ม</h2>
            <button
              onClick={() => setShowCreateGroup(false)}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="label">ชื่อกลุ่ม</label>
              <input
                type="text"
                className="input"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="ชื่อกลุ่มของคุณ"
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? "กำลังสร้าง..." : "สร้างกลุ่ม"}
            </button>
          </form>
        </div>
      )}

      {/* Join Group Modal */}
      {ENABLE_GROUP_UI && showJoinGroup && (
        <div className="card mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">เข้าร่วมกลุ่ม</h2>
            <button
              onClick={() => setShowJoinGroup(false)}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>
          <form onSubmit={handleJoinGroup} className="space-y-4">
            <div>
              <label className="label">Group Code</label>
              <input
                type="text"
                className="input"
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value)}
                placeholder="กรอก code ของกลุ่ม"
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? "กำลังเข้าร่วม..." : "เข้าร่วมกลุ่ม"}
            </button>
          </form>
        </div>
      )}

      {/* My Groups */}
      {ENABLE_GROUP_UI && groups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">กลุ่มของฉัน</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((group) => (
              <div key={group.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{group.name}</h3>
                    <p className="text-sm text-gray-500">
                      <Users className="inline h-3 w-3 mr-1" />
                      {group._count.members} สมาชิก
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {group.code}
                    </code>
                    <button
                      onClick={() => copyToClipboard(group.code)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {group.owner.id === user.id && (
                  <button
                    onClick={() => {
                      setSelectedGroup(group.id);
                      setShowGroupQR(true);
                      setShowGenerateQR(false);
                      setSelectedBuilding("");
                      setSelectedFloor("");
                      setSelectedRoom("");
                      setQrDataUrl("");
                      setGeneratedToken("");
                    }}
                    className="btn-secondary w-full mt-3 text-sm"
                  >
                    <QrCode className="h-4 w-4" />
                    สร้าง Group QR
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate Group QR Modal */}
      {ENABLE_GROUP_UI && showGroupQR && (
        <div className="card mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">
              <QrCode className="inline h-5 w-5 mr-2" />
              สร้าง Group QR
            </h2>
            <button
              onClick={() => setShowGroupQR(false)}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>

          {qrDataUrl ? (
            <div className="text-center">
              <Image
                src={qrDataUrl}
                alt="Group QR Code"
                width={300}
                height={300}
                className="mx-auto mb-4"
              />
              <div className="flex items-center justify-center gap-2 mb-4">
                <code className="text-xs bg-gray-100 px-3 py-1 rounded">
                  {generatedToken}
                </code>
                <button
                  onClick={() => copyToClipboard(generatedToken)}
                  className="btn-secondary text-xs py-1 px-2"
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleGenerateGroupQR} className="space-y-4">
              <div>
                <label className="label">เลือกอาคาร</label>
                <select
                  className="input"
                  value={selectedBuilding}
                  onChange={(e) => {
                    setSelectedBuilding(e.target.value);
                    setSelectedFloor("");
                    setSelectedRoom("");
                  }}
                  required
                >
                  <option value="">-- เลือกอาคาร --</option>
                  {buildingOptions.map((building) => (
                    <option key={building} value={building}>
                      {building}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">เลือกชั้น</label>
                <select
                  className="input"
                  value={selectedFloor}
                  onChange={(e) => {
                    setSelectedFloor(e.target.value);
                    setSelectedRoom("");
                  }}
                  disabled={!selectedBuilding}
                  required
                >
                  <option value="">-- เลือกชั้น --</option>
                  {floorOptions.map((floor) => (
                    <option key={floor} value={floor}>
                      {floor === "OTHER" ? "OTHER" : `ชั้น ${floor}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">เลือกห้อง</label>
                <select
                  className="input"
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  disabled={!selectedFloor}
                  required
                >
                  <option value="">-- เลือกห้อง --</option>
                  {filteredRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} ({room.roomCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">เริ่มต้น</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    min={minDateTime}
                    required
                  />
                </div>
                <div>
                  <label className="label">สิ้นสุด</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                    min={validFrom || minDateTime}
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading}
              >
                {loading ? "กำลังสร้าง..." : "สร้าง Group QR Code"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* View Token QR Modal */}
      {viewingToken && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeViewToken}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeViewToken}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center">
              <h3 className="text-lg font-semibold mb-1">
                {viewingToken.room.name}
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                {new Date(viewingToken.validFrom).toLocaleString("th-TH")} –{" "}
                {new Date(viewingToken.validTo).toLocaleString("th-TH")}
              </p>
              {viewingToken.group && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full mb-4 inline-block">
                  กลุ่ม: {viewingToken.group.name}
                </span>
              )}

              {viewQrDataUrl && (
                <Image
                  src={viewQrDataUrl}
                  alt="QR Code"
                  width={300}
                  height={300}
                  className="mx-auto mb-4"
                />
              )}

              <div className="flex items-center justify-center gap-2 mb-4">
                <code className="text-xs bg-gray-100 px-3 py-1.5 rounded break-all">
                  {viewingToken.token}
                </code>
                <button
                  onClick={() => copyToClipboard(viewingToken.token)}
                  className="btn-secondary text-xs py-1 px-2 shrink-0"
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-sm text-green-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                ใช้งานได้ – หมดอายุ{" "}
                {new Date(viewingToken.validTo).toLocaleString("th-TH")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* My Tokens */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          <Clock className="inline h-5 w-5 mr-2" />
          Token ของฉัน
        </h2>
        {tokens.length === 0 ? (
          <div className="card text-center text-gray-500 py-8">
            <DoorOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>ยังไม่มี Token</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Active Tokens */}
            {tokens.filter((t) => new Date(t.validTo) > new Date()).length >
              0 && (
              <div className="mb-2">
                <p className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  ใช้งานได้
                </p>
                <div className="space-y-2">
                  {tokens
                    .filter((t) => new Date(t.validTo) > new Date())
                    .map((token) => (
                      <button
                        key={token.id}
                        onClick={() => handleViewToken(token)}
                        className="card py-4 w-full text-left hover:shadow-md hover:border-(--color-secondary)/30 transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-50 text-green-600 group-hover:bg-green-100 transition-colors">
                              <QrCode className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium">{token.room.name}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(token.validFrom).toLocaleString(
                                  "th-TH",
                                )}{" "}
                                –{" "}
                                {new Date(token.validTo).toLocaleString(
                                  "th-TH",
                                )}
                              </p>
                              {token.group && (
                                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full mt-1 inline-block">
                                  กลุ่ม: {token.group.name}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-gray-400 group-hover:text-(--color-secondary) transition-colors">
                            <Eye className="h-4 w-4" />
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Expired Tokens */}
            {tokens.filter((t) => new Date(t.validTo) <= new Date()).length >
              0 && (
              <div>
                <p className="text-sm font-medium text-gray-400 mb-2">
                  หมดอายุ
                </p>
                <div className="space-y-2">
                  {tokens
                    .filter((t) => new Date(t.validTo) <= new Date())
                    .slice(0, 10)
                    .map((token) => (
                      <div key={token.id} className="card py-4 opacity-60">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gray-50 text-gray-400">
                              <QrCode className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-500">
                                {token.room.name}
                              </p>
                              <p className="text-xs text-gray-400">
                                {new Date(token.validFrom).toLocaleString(
                                  "th-TH",
                                )}{" "}
                                –{" "}
                                {new Date(token.validTo).toLocaleString(
                                  "th-TH",
                                )}
                              </p>
                              {token.group && (
                                <span className="text-xs bg-purple-50 text-purple-400 px-2 py-0.5 rounded-full mt-1 inline-block">
                                  กลุ่ม: {token.group.name}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="badge bg-gray-100 text-gray-500">
                            หมดอายุ
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
