import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkInAction, checkOutAction } from "@/actions/sessions";
import { resolveRoomEntitlement } from "@/lib/room-entitlement";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const FACE_THRESHOLD = parseFloat(process.env.FACE_THRESHOLD || "0.73");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image_base64, room_code } = body as {
      image_base64: string;
      room_code: string;
    };

    if (!image_base64 || !room_code) {
      return NextResponse.json(
        { error: "Missing image or room_code" },
        { status: 400 }
      );
    }

    // Get room info
    const room = await prisma.room.findUnique({
      where: { roomCode: room_code },
    });

    if (!room || !room.isActive) {
      return NextResponse.json({
        matched: false,
        face_detected: false,
        message: "ไม่พบห้องนี้",
      });
    }

    // Get all enrolled non-guest face profiles
    const faceProfiles = await prisma.faceProfile.findMany({
      where: {
        user: {
          role: { not: "GUEST" },
        },
      },
      select: {
        userId: true,
        embedding: true,
      },
    });

    if (faceProfiles.length === 0) {
      return NextResponse.json({
        matched: false,
        face_detected: false,
        message: "ยังไม่มีผู้ใช้ลงทะเบียนใบหน้าในระบบ",
      });
    }

    // Call AI service to verify
    console.log(`[VERIFY] Calling AI service at: ${AI_SERVICE_URL}/verify`);
    
    let aiRes;
    try {
      aiRes = await fetch(`${AI_SERVICE_URL}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64,
          embeddings: faceProfiles.map((fp) => ({
            user_id: fp.userId,
            embedding: fp.embedding,
          })),
          threshold: FACE_THRESHOLD,
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });
    } catch (err) {
      console.error("[VERIFY] Fetch failed:", err);
      return NextResponse.json(
        {
          matched: false,
          face_detected: false,
          message: "ไม่สามารถตรวจสอบใบหน้าได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
        },
        { status: 503 }
      );
    }

    if (!aiRes.ok) {
      console.error("AI service verify error:", await aiRes.text());
      return NextResponse.json(
        { matched: false, face_detected: false, message: "ไม่สามารถตรวจสอบใบหน้าได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" },
        { status: 502 }
      );
    }

    const aiData = await aiRes.json();

    if (!aiData.matched || !aiData.user_id) {
      // Log denial
      await prisma.log.create({
        data: {
          roomId: room.id,
          action: "FACE_DENIED",
          details: `Face verify failed: ${aiData.message} (score: ${aiData.score})`,
        },
      });

      return NextResponse.json({
        matched: false,
        face_detected: aiData.face_detected,
        score: aiData.score,
        message: aiData.message,
      });
    }

    // Face matched — get user info
    const user = await prisma.user.findUnique({
      where: { id: aiData.user_id },
      select: { id: true, name: true, role: true },
    });

    if (!user) {
      return NextResponse.json({
        matched: false,
        face_detected: true,
        message: "ไม่พบข้อมูลผู้ใช้",
      });
    }

    // Check if room is student-tier and user is GUEST
    if (room.staffOnly && user.role === "GUEST") {
      return NextResponse.json({
        matched: true,
        face_detected: true,
        score: aiData.score,
        message: "ห้องนี้สำหรับนักศึกษาเท่านั้น",
        access_granted: false,
        user: { id: user.id, name: user.name, role: user.role },
      });
    }

    // Booking-tier users (STUDENT, GUEST) need a current entitlement for THIS room, for
    // THIS matched user only: a class, an APPROVED booking they participate in, or a
    // legacy token issued to them. ADMIN/SUPER_ADMIN are not entitlement-checked here
    // (unchanged existing policy).
    let scheduledCheckOut: Date | undefined;
    if (user.role === "STUDENT" || user.role === "GUEST") {
      const entitlement = await resolveRoomEntitlement({ userId: user.id, roomId: room.id, now: new Date() });

      if (!entitlement.allowed) {
        await prisma.log.create({
          data: {
            userId: user.id,
            roomId: room.id,
            action: "ACCESS_DENIED",
            details: "Denied: no current class, approved booking or access token for this room",
          },
        });

        return NextResponse.json({
          matched: true,
          face_detected: true,
          score: aiData.score,
          access_granted: false,
          message: "ไม่พบตารางเรียนหรือการจองที่อนุมัติแล้วสำหรับห้องนี้ในเวลานี้",
          user: { id: user.id, name: user.name, role: user.role },
        });
      }

      scheduledCheckOut = entitlement.validUntil;
    }

    // Try check-in, if already checked in → check-out
    let isCheckOut = false;
    const checkInResult = await checkInAction({
      userId: user.id,
      roomId: room.id,
      scheduledCheckOut,
    });

    if (checkInResult.error && checkInResult.sessionId) {
      // Already has active session → checkout
      const checkOutResult = await checkOutAction({
        userId: user.id,
        roomId: room.id,
      });
      if (checkOutResult.error) {
        return NextResponse.json({
          matched: true,
          face_detected: true,
          score: aiData.score,
          message: "เกิดข้อผิดพลาดในการออกจากห้อง",
          access_granted: false,
          user: { id: user.id, name: user.name, role: user.role },
        });
      }
      isCheckOut = true;
    } else if (checkInResult.error) {
      return NextResponse.json({
        matched: true,
        face_detected: true,
        score: aiData.score,
        message: checkInResult.error,
        access_granted: false,
        user: { id: user.id, name: user.name, role: user.role },
      });
    }

    // Log face verification success
    await prisma.log.create({
      data: {
        userId: user.id,
        roomId: room.id,
        action: "FACE_VERIFIED",
        details: `Face verified (score: ${aiData.score}) → ${isCheckOut ? "Check-out" : "Check-in"}`,
      },
    });

    return NextResponse.json({
      matched: true,
      face_detected: true,
      score: aiData.score,
      access_granted: true,
      is_check_out: isCheckOut,
      message: isCheckOut ? "ออกจากห้องสำเร็จ" : "เข้าใช้ห้องสำเร็จ",
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error("Face verify error:", error);
    return NextResponse.json(
      { matched: false, face_detected: false, message: "เกิดข้อผิดพลาดในระบบ" },
      { status: 500 }
    );
  }
}
