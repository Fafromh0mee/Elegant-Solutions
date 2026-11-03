import { NextRequest, NextResponse } from "next/server";
import { activateMachine } from "@/lib/agent-activation";
import { checkAgentRateLimit } from "@/lib/agent-rate-limit";

const activationErrors = {
  INVALID: "รหัสเปิดใช้งานไม่ถูกต้อง",
  EXPIRED: "รหัสเปิดใช้งานหมดอายุแล้ว",
  CONSUMED: "รหัสเปิดใช้งานถูกใช้แล้ว",
  CANCELLED: "รหัสเปิดใช้งานถูกยกเลิกแล้ว",
  ROOM_UNAVAILABLE: "ห้องที่กำหนดไว้ไม่พร้อมใช้งาน",
} as const;

export async function POST(req: NextRequest) {
  let body: { activationCode?: string; hostname?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const activationCode = body.activationCode?.trim() ?? "";
  const hostname = body.hostname?.trim() ?? "";
  const platform = body.platform?.trim() || undefined;
  if (!/^\d{6}$/.test(activationCode) || !hostname || hostname.length > 255 || (platform && platform.length > 100)) {
    return NextResponse.json({ error: "Invalid activation request" }, { status: 400 });
  }

  const address = req.headers.get("x-real-ip")?.trim().slice(0, 64) || "unknown";
  const rate = checkAgentRateLimit(`activation:${address}`, { limit: 12, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "ลองเปิดใช้งานบ่อยเกินไป กรุณารอสักครู่" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const result = await activateMachine({ code: activationCode, hostname, platform });
  if (!result.ok) {
    return NextResponse.json({ error: activationErrors[result.reason], code: result.reason }, { status: 403 });
  }
  return NextResponse.json(result);
}
