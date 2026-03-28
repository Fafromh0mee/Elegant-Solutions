import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkInAction, checkOutAction } from "@/actions/sessions";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const FACE_THRESHOLD = parseFloat(process.env.FACE_THRESHOLD || "0.73");

function getCurrentDayAndTime() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return { dayOfWeek, currentTime: `${hh}:${mm}` };
}

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
          message: "ไม่สามารถเชื่อมต่อ AI Service ได้",
        },
        { status: 503 }
      );
    }

    if (!aiRes.ok) {
      console.error("AI service verify error:", await aiRes.text());
      return NextResponse.json(
        { matched: false, face_detected: false, message: "AI Service error" },
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
        message: "ห้องนี้สำหรับ STUDENT เท่านั้น",
        access_granted: false,
        user: { id: user.id, name: user.name, role: user.role },
      });
    }

    // Enforce student policy: must have current class schedule or active room registration.
    if (user.role === "STUDENT") {
      const { dayOfWeek, currentTime } = getCurrentDayAndTime();

      const currentClass = await prisma.classSchedule.findFirst({
        where: {
          userId: user.id,
          roomId: room.id,
          dayOfWeek,
          startTime: { lte: currentTime },
          endTime: { gte: currentTime },
        },
        select: { id: true },
      });

      let hasRegistration = false;
      if (!currentClass) {
        const now = new Date();

        const directToken = await prisma.accessToken.findFirst({
          where: {
            userId: user.id,
            roomId: room.id,
            validFrom: { lte: now },
            validTo: { gte: now },
          },
          select: { id: true },
        });

        if (directToken) {
          hasRegistration = true;
        } else {
          const groupToken = await prisma.accessToken.findFirst({
            where: {
              groupId: { not: null },
              roomId: room.id,
              validFrom: { lte: now },
              validTo: { gte: now },
              group: {
                members: {
                  some: {
                    userId: user.id,
                  },
                },
              },
            },
            select: { id: true },
          });

          if (groupToken) {
            hasRegistration = true;
          }
        }
      }

      if (!currentClass && !hasRegistration) {
        await prisma.log.create({
          data: {
            userId: user.id,
            roomId: room.id,
            action: "ACCESS_DENIED",
            details: "Denied: student has no current class schedule and no active room registration",
          },
        });

        return NextResponse.json({
          matched: true,
          face_detected: true,
          score: aiData.score,
          access_granted: false,
          message: "ไม่พบตารางเรียนหรือรายการลงทะเบียนขอเข้าใช้ห้องในเวลานี้ กรุณาลงทะเบียนขอเข้าใช้ห้องก่อนใช้งาน",
          user: { id: user.id, name: user.name, role: user.role },
        });
      }
    }

    // Try check-in, if already checked in → check-out
    let isCheckOut = false;
    const checkInResult = await checkInAction({
      userId: user.id,
      roomId: room.id,
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
          message: "เกิดข้อผิดพลาดในการ Check-out",
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
      message: isCheckOut ? "Check-out สำเร็จ" : "Check-in สำเร็จ",
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
