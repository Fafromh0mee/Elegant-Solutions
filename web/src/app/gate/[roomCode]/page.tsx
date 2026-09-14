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
import { verifyGateAccessAction } from "@/actions/access-tokens";
import { checkInAction, checkOutAction } from "@/actions/sessions";
import { unlockDoorAction } from "@/actions/door-control";

// Two-factor gate flow: STEP 1 (face) must pass before STEP 2 (QR/manual token)
// becomes reachable, and the token in STEP 2 is verified against the exact
// person who passed STEP 1 (see expectedUserId passed to verifyGateAccessAction).
type GateStep = "FACE" | "ACCESS";
type GateStatus = "IDLE" | "SCANNING" | "OPEN" | "CLOSED";
type InputMode = "camera" | "manual";

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
  const [step, setStep] = useState<GateStep>("FACE");
  const [status, setStatus] = useState<GateStatus>("IDLE");
  const [message, setMessage] = useState("");
  // Identity confirmed at step 1 (face scan)
  const [verifiedUser, setVerifiedUser] = useState<VerifiedUser | null>(null);
  // True only when the visitor explicitly skipped step 1 via "ไม่มีใบหน้า
  // ลงทะเบียน (ผู้เยี่ยมชม)" — real 2FA is otherwise untouched. The server
  // action enforces GUEST-only for this flow regardless of what the client
  // claims here, so this flag is just what drives the UI/what gets passed.
  const [guestFlow, setGuestFlow] = useState(false);
  // Final set of people checked in/out at step 2 (supports group tokens)
  const [verifiedUsers, setVerifiedUsers] = useState<VerifiedUser[]>([]);
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("camera");
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
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

  // Full reset back to step 1 (face scan), clearing everything from step 2.
  const resetToFaceStep = useCallback(() => {
    setStep("FACE");
    setStatus("IDLE");
    setMessage("");
    setVerifiedUser(null);
    setVerifiedUsers([]);
    setTokenInput("");
    setFaceMessage("");
    setInputMode("camera");
    setGuestFlow(false);
  }, []);

  // Let the same (already face-verified) person try QR/manual again without
  // being sent back to step 1.
  const retryAccessStep = useCallback(() => {
    setStatus("IDLE");
    setMessage("");
    setTokenInput("");
  }, []);

  // ───────── QR token / studentId processing (STEP 2) ─────────
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
        const result = await verifyGateAccessAction(
          token.trim(),
          roomCode,
          verifiedUser?.id,
          guestFlow,
        );

        if (!result.valid) {
          setStatus("CLOSED");
          const deniedReason = "reason" in result ? result.reason : undefined;
          setMessage(deniedReason || "การเข้าถึงถูกปฏิเสธ");
          setLoading(false);
          processingRef.current = false;
          return;
        }

        const users = result.users as VerifiedUser[];
        const roomId = result.roomId as string;
        const scheduledCheckOut =
          "scheduledCheckOut" in result && result.scheduledCheckOut instanceof Date
            ? result.scheduledCheckOut
            : undefined;

        let allSuccess = true;
        let isCheckOut = false;

        for (const user of users) {
          const checkInResult = await checkInAction({
            userId: user.id,
            roomId,
            scheduledCheckOut,
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
              : `${result.isGroup ? "กลุ่ม" : ""} Check-in สำเร็จ`,
          );
          // Door unlock is simulated for now (no hardware yet) — fire-and-forget,
          // no need to block the UI on it.
          void unlockDoorAction(roomId, roomCode);
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
    [roomCode, verifiedUser, guestFlow],
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
        () => {},
      );
      setCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(
        "ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง หรือใช้โหมดอื่น",
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

  // Undo the guest bypass from step 2: stop whatever camera step 2 has
  // running (no-op if none, e.g. manual mode) before resetToFaceStep swaps
  // the DOM back to step 1 — otherwise a still-scanning QR camera can be
  // left orphaned underneath the unmounted step-2 markup.
  const backToFaceStepFromAccess = useCallback(async () => {
    await stopQrCamera();
    resetToFaceStep();
  }, [stopQrCamera, resetToFaceStep]);

  const switchQrCamera = useCallback(async () => {
    await stopQrCamera();
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, [stopQrCamera]);

  // ───────── Face scan (STEP 1) ─────────
  const startFaceCamera = useCallback(async () => {
    setCameraError("");
    setFaceMessage("");
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

  // Explicit escape hatch for visitors who can never enroll a face (GUEST
  // accounts are blocked from enrolling — see api/face/enroll/route.ts).
  // Skips straight to step 2 with no verifiedUser; the server still
  // fail-closed rejects anything but an all-GUEST token/studentId there.
  const skipToGuestAccess = useCallback(() => {
    stopFaceCamera();
    setGuestFlow(true);
    setVerifiedUser(null);
    setInputMode("camera");
    setStep("ACCESS");
    setFaceMessage("");
  }, [stopFaceCamera]);

  // Auto-snap & verify every 600ms while at step 1.
  // matched: true  → identity confirmed, move on to step 2 (access still unchecked).
  // matched: false but face_detected: true → a face was found but doesn't match
  //   anyone enrolled — hard reject, must retry step 1, never proceeds to step 2.
  // matched: false and face_detected: false → no face in frame yet, keep waiting.
  useEffect(() => {
    if (step !== "FACE" || status !== "IDLE" || !faceStream) return;

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

        if (data.matched && data.user) {
          if (faceIntervalRef.current) {
            clearInterval(faceIntervalRef.current);
            faceIntervalRef.current = null;
          }
          stopFaceCamera();
          setVerifiedUser(data.user);
          setInputMode("camera");
          setStep("ACCESS");
          setFaceMessage("");
        } else if (data.face_detected) {
          if (faceIntervalRef.current) {
            clearInterval(faceIntervalRef.current);
            faceIntervalRef.current = null;
          }
          setStatus("CLOSED");
          setMessage("ไม่รู้จักใบหน้านี้ กรุณาลงทะเบียนก่อนใช้งาน");
          setFaceMessage("");
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
  }, [step, status, faceStream, roomCode, stopFaceCamera]);

  // ───────── Mode switching (STEP 2 only: QR vs manual) ─────────
  const switchMode = useCallback(
    async (newMode: InputMode) => {
      if (inputMode === "camera") await stopQrCamera();
      setInputMode(newMode);
      setCameraError("");
    },
    [inputMode, stopQrCamera],
  );

  // Auto-start the relevant camera for whichever step/mode is active.
  useEffect(() => {
    if (status !== "IDLE") return;
    if (step === "ACCESS" && inputMode === "camera") {
      const t = setTimeout(() => startQrCamera(), 300);
      return () => clearTimeout(t);
    }
    if (step === "FACE") {
      const t = setTimeout(() => startFaceCamera(), 300);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, inputMode, status, facingMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (html5QrRef.current?.isScanning)
        html5QrRef.current.stop().catch(() => {});
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    };
  }, []);

  // Auto-focus input in manual mode
  useEffect(() => {
    if (step === "ACCESS" && inputMode === "manual") inputRef.current?.focus();
  }, [step, inputMode, status]);

  // Step 2 succeeded (door opened) or step 1 rejected the face outright →
  // full reset back to step 1 after a short pause.
  useEffect(() => {
    if (status === "OPEN" || (status === "CLOSED" && step === "FACE")) {
      const timer = setTimeout(() => {
        resetToFaceStep();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status, step, resetToFaceStep]);

  // Step 2 failed (wrong/expired/not-your token) → give the same person a
  // 15s grace period to retry step 2 before forcing a full reset back to
  // step 1. This stops someone from standing at the kiosk indefinitely
  // guessing other people's tokens once they no longer have anything valid.
  useEffect(() => {
    if (status === "CLOSED" && step === "ACCESS") {
      const timer = setTimeout(() => {
        resetToFaceStep();
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [status, step, resetToFaceStep]);

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

      {/* Mode Selector & Camera Switch — only reachable after step 1 (face) passes */}
      {step === "ACCESS" && status !== "OPEN" && (
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
              onClick={() => switchMode("manual")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${inputMode === "manual" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}
              title="กรอก Token หรือ Student ID"
            >
              <Keyboard className="h-4 w-4" />
              <span className="hidden sm:inline">Manual</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="text-center text-white w-full max-w-md">
        {/* ═══════ STEP 1: Face scan ═══════ */}
        {step === "FACE" && status === "IDLE" && (
          <>
            <h1 className="text-2xl font-bold mb-4">สแกนใบหน้า</h1>
            <p className="text-sm text-white/60 mb-4">
              หันหน้าเข้ากล้องเพื่อยืนยันตัวตน (ขั้นตอนที่ 1 จาก 2)
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

            {/* Escape hatch for visitors with no enrolled face (GUEST accounts
                cannot enroll — see api/face/enroll/route.ts). Server-side
                verifyGateAccessAction still fail-closed rejects this path
                unless every user tied to the token/studentId is a GUEST. */}
            <button
              type="button"
              onClick={skipToGuestAccess}
              className="mt-3 text-white/50 underline text-xs hover:text-white/80"
            >
              ไม่มีใบหน้าลงทะเบียน (ผู้เยี่ยมชม)
            </button>
          </>
        )}

        {/* ═══════ STEP 2: QR camera ═══════ */}
        {step === "ACCESS" && status === "IDLE" && inputMode === "camera" && (
          <>
            {verifiedUser && (
              <div className="mb-4 inline-flex items-center gap-2 bg-green-500/20 border border-green-400/40 rounded-lg px-4 py-2 text-sm text-green-200">
                <CheckCircle className="h-4 w-4" />
                สแกนใบหน้าสำเร็จ — {verifiedUser.name}
              </div>
            )}
            {guestFlow && !verifiedUser && (
              <div className="mb-4 flex flex-col items-center gap-2">
                <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-400/40 rounded-lg px-4 py-2 text-sm text-amber-200">
                  โหมดผู้เยี่ยมชม — เฉพาะ Token/QR ของผู้เยี่ยมชมเท่านั้น
                </div>
                <button
                  type="button"
                  onClick={backToFaceStepFromAccess}
                  className="text-white/50 underline text-xs hover:text-white/80"
                >
                  ไม่ใช่ผู้เยี่ยมชม — กลับไปสแกนหน้า
                </button>
              </div>
            )}
            <h1 className="text-2xl font-bold mb-4">สแกน QR Code</h1>
            <p className="text-sm text-white/60 mb-4">
              ส่อง QR Code เข้ากรอบเพื่อเข้า-ออกห้อง (ขั้นตอนที่ 2 จาก 2)
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

        {/* ═══════ STEP 2: Manual ═══════ */}
        {step === "ACCESS" && status === "IDLE" && inputMode === "manual" && (
          <>
            {verifiedUser && (
              <div className="mb-4 inline-flex items-center gap-2 bg-green-500/20 border border-green-400/40 rounded-lg px-4 py-2 text-sm text-green-200">
                <CheckCircle className="h-4 w-4" />
                สแกนใบหน้าสำเร็จ — {verifiedUser.name}
              </div>
            )}
            {guestFlow && !verifiedUser && (
              <div className="mb-4 flex flex-col items-center gap-2">
                <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-400/40 rounded-lg px-4 py-2 text-sm text-amber-200">
                  โหมดผู้เยี่ยมชม — เฉพาะ Token/QR ของผู้เยี่ยมชมเท่านั้น
                </div>
                <button
                  type="button"
                  onClick={backToFaceStepFromAccess}
                  className="text-white/50 underline text-xs hover:text-white/80"
                >
                  ไม่ใช่ผู้เยี่ยมชม — กลับไปสแกนหน้า
                </button>
              </div>
            )}
            <QrCode className="h-16 w-16 mx-auto mb-4 animate-pulse" />
            <h1 className="text-2xl font-bold mb-2">
              กรอก Token หรือ Student ID
            </h1>
            <p className="text-sm text-white/60 mb-6">
              กรอกรหัส Token หรือ Student ID เพื่อตรวจสอบสิทธิ์เข้า-ออกห้อง (ขั้นตอนที่ 2 จาก 2)
            </p>
            <form onSubmit={handleManualScan} className="w-full">
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-6 py-4 text-center text-white placeholder-white/40 text-lg focus:outline-none focus:ring-2 focus:ring-white/50"
                placeholder="กรอก Token หรือ Student ID"
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
                    {u.name} <span className="text-white/70">({u.role})</span>
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
            <p className="text-lg mb-4">{message}</p>
            {step === "ACCESS" && (
              <button
                onClick={retryAccessStep}
                className="bg-white/20 hover:bg-white/30 text-white rounded-xl px-6 py-3 font-medium transition-colors"
              >
                ลองสแกน QR/Token ใหม่
              </button>
            )}
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
