"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import {
  DoorOpen,
  DoorClosed,
  QrCode,
  AlertCircle,
  CheckCircle,
  Users,
  Camera,
  CameraOff,
  SwitchCamera,
  Keyboard,
  ScanFace,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { verifyAccessTokenAction } from "@/actions/access-tokens";
import { checkInAction, checkOutAction } from "@/actions/sessions";

type GateStatus = "IDLE" | "SCANNING" | "OPEN" | "CLOSED";
type InputMode = "camera" | "manual" | "face";

interface VerifiedUser {
  id: string;
  name: string;
  role: string;
}

export default function GatePage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const [status, setStatus] = useState<GateStatus>("IDLE");
  const [message, setMessage] = useState("");
  const [verifiedUsers, setVerifiedUsers] = useState<VerifiedUser[]>([]);
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("camera");
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [cameraError, setCameraError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);

  // Face scan state
  const [faceStream, setFaceStream] = useState<MediaStream | null>(null);
  const [faceMessage, setFaceMessage] = useState("");
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ───────── QR token processing (unchanged) ─────────
  const processToken = useCallback(
    async (token: string) => {
      if (processingRef.current || !token.trim()) return;
      processingRef.current = true;

      setLoading(true);
      setStatus("SCANNING");

      if (html5QrRef.current?.isScanning) {
        try {
          await html5QrRef.current.stop();
          setCameraActive(false);
        } catch {
          /* ignore */
        }
      }

      try {
        const result = await verifyAccessTokenAction(token.trim(), roomCode);

        if (!result.valid) {
          setStatus("CLOSED");
          setMessage(result.reason || "การเข้าถึงถูกปฏิเสธ");
          setLoading(false);
          processingRef.current = false;
          return;
        }

        const users = result.users as VerifiedUser[];
        const roomId = result.roomId as string;

        let allSuccess = true;
        let isCheckOut = false;

        for (const user of users) {
          const checkInResult = await checkInAction({
            userId: user.id,
            roomId,
          });

          if (checkInResult.error && checkInResult.sessionId) {
            const checkOutResult = await checkOutAction({
              userId: user.id,
              roomId,
            });
            if (checkOutResult.error) {
              allSuccess = false;
            } else {
              isCheckOut = true;
            }
          } else if (checkInResult.error) {
            allSuccess = false;
          }
        }

        if (allSuccess) {
          setStatus("OPEN");
          setVerifiedUsers(users);
          setMessage(
            isCheckOut
              ? `${result.isGroup ? "กลุ่ม" : ""} Check-out สำเร็จ`
              : `${result.isGroup ? "กลุ่ม" : ""} Check-in สำเร็จ`
          );
        } else {
          setStatus("CLOSED");
          setMessage("เกิดข้อผิดพลาดบางส่วน");
        }
      } catch (error) {
        console.error("Gate scan error:", error);
        setStatus("CLOSED");
        setMessage("เกิดข้อผิดพลาดในระบบ");
      }

      setLoading(false);
      processingRef.current = false;
    },
    [roomCode]
  );

  // ───────── QR camera ─────────
  const startQrCamera = useCallback(async () => {
    setCameraError("");
    const scannerId = "qr-scanner-region";
    const el = document.getElementById(scannerId);
    if (!el) return;

    try {
      if (html5QrRef.current?.isScanning) {
        await html5QrRef.current.stop();
      }
    } catch {
      /* ignore */
    }

    const scanner = new Html5Qrcode(scannerId);
    html5QrRef.current = scanner;

    try {
      await scanner.start(
        { facingMode },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => processToken(decodedText),
        () => {}
      );
      setCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(
        "ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง หรือใช้โหมดอื่น"
      );
      setCameraActive(false);
    }
  }, [facingMode, processToken]);

  const stopQrCamera = useCallback(async () => {
    if (html5QrRef.current?.isScanning) {
      try {
        await html5QrRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    setCameraActive(false);
  }, []);

  const switchQrCamera = useCallback(async () => {
    await stopQrCamera();
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, [stopQrCamera]);

  // ───────── Face scan ─────────
  const startFaceCamera = useCallback(async () => {
    setCameraError("");
    setFaceMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      setFaceStream(stream);
      if (faceVideoRef.current) {
        faceVideoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError("ไม่สามารถเปิดกล้องได้");
    }
  }, []);

  const stopFaceCamera = useCallback(() => {
    if (faceIntervalRef.current) {
      clearInterval(faceIntervalRef.current);
      faceIntervalRef.current = null;
    }
    if (faceStream) {
      faceStream.getTracks().forEach((t) => t.stop());
      setFaceStream(null);
    }
  }, [faceStream]);

  // Auto-snap & verify every 500ms in face mode
  useEffect(() => {
    if (inputMode !== "face" || status !== "IDLE" || !faceStream) return;

    const snap = async () => {
      if (processingRef.current) return;
      if (!faceVideoRef.current || !faceCanvasRef.current) return;

      const video = faceVideoRef.current;
      const canvas = faceCanvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

      processingRef.current = true;
      setFaceMessage("กำลังสแกน...");

      try {
        const res = await fetch("/api/face/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: dataUrl, room_code: roomCode }),
        });
        const data = await res.json();

        if (data.access_granted && data.user) {
          // Stop camera & show result
          if (faceIntervalRef.current) {
            clearInterval(faceIntervalRef.current);
            faceIntervalRef.current = null;
          }
          setStatus(data.access_granted ? "OPEN" : "CLOSED");
          setVerifiedUsers([data.user]);
          setMessage(
            `${data.is_check_out ? "Check-out" : "Check-in"} สำเร็จ (${Math.round(data.score * 100)}%)`
          );
          setFaceMessage("");
        } else if (data.matched && !data.access_granted) {
          // Matched but no access
          if (faceIntervalRef.current) {
            clearInterval(faceIntervalRef.current);
            faceIntervalRef.current = null;
          }
          setStatus("CLOSED");
          setMessage(data.message);
          setVerifiedUsers(data.user ? [data.user] : []);
          setFaceMessage("");
        } else if (data.face_detected) {
          setFaceMessage(data.message || "ไม่สามารถยืนยันตัวตนได้");
        } else {
          setFaceMessage(data.message || "ขยับหน้าให้อยู่ในกรอบ");
        }
      } catch {
        setFaceMessage("ไม่สามารถเชื่อมต่อ AI Service ได้");
      }

      processingRef.current = false;
    };

    faceIntervalRef.current = setInterval(snap, 600);
    return () => {
      if (faceIntervalRef.current) {
        clearInterval(faceIntervalRef.current);
        faceIntervalRef.current = null;
      }
    };
  }, [inputMode, status, faceStream, roomCode]);

  // ───────── Mode switching ─────────
  const switchMode = useCallback(
    async (newMode: InputMode) => {
      // Stop current mode's camera
      if (inputMode === "camera") await stopQrCamera();
      if (inputMode === "face") stopFaceCamera();

      setInputMode(newMode);
      setCameraError("");
      setFaceMessage("");
    },
    [inputMode, stopQrCamera, stopFaceCamera]
  );

  // Auto-start cameras
  useEffect(() => {
    if (status !== "IDLE") return;
    if (inputMode === "camera") {
      const t = setTimeout(() => startQrCamera(), 300);
      return () => clearTimeout(t);
    }
    if (inputMode === "face") {
      const t = setTimeout(() => startFaceCamera(), 300);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, status, facingMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (html5QrRef.current?.isScanning) html5QrRef.current.stop().catch(() => {});
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    };
  }, []);

  // Auto-focus input in manual mode
  useEffect(() => {
    if (inputMode === "manual") inputRef.current?.focus();
  }, [inputMode, status]);

  // Auto-reset after 5s
  useEffect(() => {
    if (status === "OPEN" || status === "CLOSED") {
      const timer = setTimeout(() => {
        setStatus("IDLE");
        setMessage("");
        setVerifiedUsers([]);
        setTokenInput("");
        setFaceMessage("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  async function handleManualScan(e: React.FormEvent) {
    e.preventDefault();
    await processToken(tokenInput.trim());
  }

  const bgColor =
    status === "OPEN"
      ? "bg-green-500"
      : status === "CLOSED"
      ? "bg-red-500"
      : "bg-gray-900";

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center transition-colors duration-500 ${bgColor} p-4`}
    >
      {/* Room Info */}
      <div className="absolute top-4 left-4 text-white/80 z-10">
        <p className="text-xs font-medium tracking-wider">GATE KIOSK</p>
        <p className="text-xl font-bold">{roomCode}</p>
      </div>

      {/* Mode Selector & Camera Switch */}
      {(status === "IDLE" || status === "SCANNING") && (
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          {inputMode === "camera" && cameraActive && (
            <button
              onClick={switchQrCamera}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-white text-sm transition-colors"
              title="สลับกล้อง"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          )}
          {/* Mode buttons */}
          <div className="flex bg-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => switchMode("camera")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${inputMode === "camera" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}
              title="QR สแกน"
            >
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">QR</span>
            </button>
            <button
              onClick={() => switchMode("face")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${inputMode === "face" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}
              title="สแกนใบหน้า"
            >
              <ScanFace className="h-4 w-4" />
              <span className="hidden sm:inline">Face</span>
            </button>
            <button
              onClick={() => switchMode("manual")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${inputMode === "manual" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}
              title="กรอก Token"
            >
              <Keyboard className="h-4 w-4" />
              <span className="hidden sm:inline">Token</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="text-center text-white w-full max-w-md">
        {/* ═══════ IDLE + QR Camera ═══════ */}
        {status === "IDLE" && inputMode === "camera" && (
          <>
            <h1 className="text-2xl font-bold mb-4">สแกน QR Code</h1>
            <p className="text-sm text-white/60 mb-4">
              ส่อง QR Code เข้ากรอบเพื่อเข้า-ออกห้อง
            </p>
            <div className="relative mx-auto w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden bg-black/50 mb-4">
              <div id="qr-scanner-region" className="w-full h-full" />
              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-4 left-4 w-10 h-10 border-t-3 border-l-3 border-white rounded-tl-lg" />
                  <div className="absolute top-4 right-4 w-10 h-10 border-t-3 border-r-3 border-white rounded-tr-lg" />
                  <div className="absolute bottom-4 left-4 w-10 h-10 border-b-3 border-l-3 border-white rounded-bl-lg" />
                  <div className="absolute bottom-4 right-4 w-10 h-10 border-b-3 border-r-3 border-white rounded-br-lg" />
                  <div className="absolute left-6 right-6 h-0.5 bg-linear-to-r from-transparent via-(--color-primary) to-transparent animate-scan-line" />
                </div>
              )}
              {!cameraActive && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <Camera className="h-12 w-12 mx-auto mb-2 text-white/40 animate-pulse" />
                    <p className="text-white/40 text-sm">กำลังเปิดกล้อง...</p>
                  </div>
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <div className="text-center">
                    <CameraOff className="h-12 w-12 mx-auto mb-2 text-red-400" />
                    <p className="text-red-300 text-sm">{cameraError}</p>
                    <button
                      onClick={startQrCamera}
                      className="mt-3 text-white/70 underline text-sm hover:text-white"
                    >
                      ลองใหม่
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════ IDLE + Face Mode ═══════ */}
        {status === "IDLE" && inputMode === "face" && (
          <>
            <h1 className="text-2xl font-bold mb-4">สแกนใบหน้า</h1>
            <p className="text-sm text-white/60 mb-4">
              หันหน้าเข้ากล้อง (STAFF เท่านั้น)
            </p>
            <div className="relative mx-auto w-full max-w-[320px] aspect-3/4 rounded-2xl overflow-hidden bg-black/50 mb-4">
              <video
                ref={faceVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              <canvas ref={faceCanvasRef} className="hidden" />

              {/* Face guide overlay */}
              {faceStream && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-52 h-64 border-2 border-white/40 rounded-[50%]" />
                  {/* Animated scan line */}
                  <div className="absolute left-6 right-6 h-0.5 bg-linear-to-r from-transparent via-green-400 to-transparent animate-scan-line" />
                </div>
              )}

              {!faceStream && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <ScanFace className="h-12 w-12 mx-auto mb-2 text-white/40 animate-pulse" />
                    <p className="text-white/40 text-sm">กำลังเปิดกล้อง...</p>
                  </div>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <div className="text-center">
                    <CameraOff className="h-12 w-12 mx-auto mb-2 text-red-400" />
                    <p className="text-red-300 text-sm">{cameraError}</p>
                    <button
                      onClick={startFaceCamera}
                      className="mt-3 text-white/70 underline text-sm hover:text-white"
                    >
                      ลองใหม่
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Face scan status message */}
            {faceMessage && (
              <div className="bg-white/10 rounded-lg px-4 py-2 text-sm text-white/80 animate-pulse">
                {faceMessage}
              </div>
            )}
          </>
        )}

        {/* ═══════ IDLE + Manual ═══════ */}
        {status === "IDLE" && inputMode === "manual" && (
          <>
            <QrCode className="h-16 w-16 mx-auto mb-4 animate-pulse" />
            <h1 className="text-2xl font-bold mb-2">กรอก Token</h1>
            <p className="text-sm text-white/60 mb-6">
              กรอกรหัส Token เพื่อเข้า-ออกห้อง
            </p>
            <form onSubmit={handleManualScan} className="w-full">
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-6 py-4 text-center text-white placeholder-white/40 text-lg focus:outline-none focus:ring-2 focus:ring-white/50"
                placeholder="กรอก Token ที่นี่"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                disabled={loading}
                autoFocus
              />
              <button
                type="submit"
                className="mt-4 w-full bg-white/20 hover:bg-white/30 text-white rounded-xl px-6 py-3 font-medium transition-colors"
                disabled={loading || !tokenInput.trim()}
              >
                {loading ? "กำลังตรวจสอบ..." : "ยืนยัน"}
              </button>
            </form>
          </>
        )}

        {/* ═══════ SCANNING ═══════ */}
        {status === "SCANNING" && (
          <>
            <div className="h-20 w-20 mx-auto mb-6 rounded-full border-4 border-white/30 border-t-white animate-spin" />
            <h1 className="text-2xl font-bold mb-2">กำลังตรวจสอบ...</h1>
          </>
        )}

        {/* ═══════ OPEN ═══════ */}
        {status === "OPEN" && (
          <>
            <DoorOpen className="h-20 w-20 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">DOOR OPEN</h1>
            <p className="text-lg mb-3">{message}</p>
            <CheckCircle className="h-8 w-8 mx-auto mb-3" />
            {verifiedUsers.length > 0 && (
              <div className="bg-white/20 rounded-xl p-4 max-w-sm mx-auto">
                {verifiedUsers.length > 1 && (
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      กลุ่ม ({verifiedUsers.length} คน)
                    </span>
                  </div>
                )}
                {verifiedUsers.map((u) => (
                  <p key={u.id} className="text-sm">
                    {u.name}{" "}
                    <span className="text-white/70">({u.role})</span>
                  </p>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══════ CLOSED ═══════ */}
        {status === "CLOSED" && (
          <>
            <DoorClosed className="h-20 w-20 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">DOOR CLOSED</h1>
            <AlertCircle className="h-8 w-8 mx-auto mb-3" />
            <p className="text-lg">{message}</p>
          </>
        )}
      </div>

      {/* Time */}
      <div className="absolute bottom-4 text-white/50 text-xs">
        <GateClock />
      </div>
    </div>
  );
}

function GateClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span>
      {time.toLocaleDateString("th-TH", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })}{" "}
      {time.toLocaleTimeString("th-TH")}
    </span>
  );
}
