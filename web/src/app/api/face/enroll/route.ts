import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }

    // Only STAFF and ADMIN can enroll face
    if (session.user.role === "GUEST") {
      return NextResponse.json(
        { error: "เฉพาะ STAFF เท่านั้นที่สามารถลงทะเบียนใบหน้าได้" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { images_base64 } = body as { images_base64: string[] };

    if (!images_base64 || images_base64.length === 0) {
      return NextResponse.json({ error: "ไม่มีรูปภาพ" }, { status: 400 });
    }

    // Call AI service
    console.log(`[ENROLL] Calling AI service at: ${AI_SERVICE_URL}/enroll`);
    
    let aiRes;
    try {
      aiRes = await fetch(`${AI_SERVICE_URL}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: session.user.id,
          images_base64,
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });
    } catch (err) {
      console.error("[ENROLL] Fetch failed:", err);
      return NextResponse.json(
        { 
          error: "ไม่สามารถเชื่อมต่อ AI Service ได้", 
          detail: err instanceof Error ? err.message : String(err),
          url: AI_SERVICE_URL 
        },
        { status: 503 }
      );
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI service error:", errText);
      return NextResponse.json(
        { error: "AI Service ไม่สามารถประมวลผลได้" },
        { status: 502 }
      );
    }

    const aiData = await aiRes.json();

    if (!aiData.success || !aiData.embedding) {
      return NextResponse.json(
        { error: aiData.message || "ลงทะเบียนใบหน้าไม่สำเร็จ" },
        { status: 400 }
      );
    }

    // Verify user exists in DB (session might have stale ID after DB reset)
    const userExists = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    if (!userExists) {
      return NextResponse.json(
        { error: "ไม่พบบัญชีผู้ใช้ กรุณา Logout แล้ว Login ใหม่" },
        { status: 401 }
      );
    }

    // Upsert face profile in DB
    await prisma.faceProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        embedding: aiData.embedding,
        modelVersion: aiData.model_version || "buffalo_l",
        qualityScore: aiData.quality_score,
      },
      update: {
        embedding: aiData.embedding,
        modelVersion: aiData.model_version || "buffalo_l",
        qualityScore: aiData.quality_score,
      },
    });

    // Log enrollment
    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "FACE_ENROLLED",
        details: `Face enrolled with quality ${aiData.quality_score}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "ลงทะเบียนใบหน้าสำเร็จ",
      quality_score: aiData.quality_score,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : "";
    console.error("Face enroll error:", errMsg);
    console.error("Stack:", errStack);
    return NextResponse.json(
      { error: `เกิดข้อผิดพลาดในระบบ: ${errMsg}` },
      { status: 500 }
    );
  }
}
