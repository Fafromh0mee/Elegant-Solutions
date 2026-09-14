import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
// ค่าที่อาจารย์ที่ปรึกษากำหนด ห้ามเปลี่ยนโดยไม่ได้รับอนุญาต
const FACE_THRESHOLD = parseFloat(process.env.FACE_THRESHOLD || "0.73");

// Step 1 ของ 2FA: ทำหน้าที่แค่ "ยืนยันตัวตนจากใบหน้า" อย่างเดียว — ไม่เช็คสิทธิ์เข้าห้อง
// ไม่เช็คตารางเรียน/token และไม่ check-in/check-out ให้ (ย้ายไปทำที่ step 2 แทน ผ่าน
// verifyGateAccessAction ใน src/actions/access-tokens.ts)
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
      await prisma.log.create({
        data: {
          roomId: room.id,
          action: "FACE_DENIED",
          details: `Face scan: not recognized (score: ${aiData.score})`,
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

    await prisma.log.create({
      data: {
        userId: user.id,
        roomId: room.id,
        action: "FACE_VERIFIED",
        details: `Face scan: recognized as ${user.name} (score: ${aiData.score})`,
      },
    });

    return NextResponse.json({
      matched: true,
      face_detected: true,
      score: aiData.score,
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
