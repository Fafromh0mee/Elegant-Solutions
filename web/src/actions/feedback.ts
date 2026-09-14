"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

// ---- Public: /contact form ----

export async function submitContactMessageAction(data: {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}) {
  const name = (data.name || "").trim();
  const email = (data.email || "").trim();
  const phone = (data.phone || "").trim();
  const subject = (data.subject || "").trim();
  const message = (data.message || "").trim();

  if (!name) {
    return { error: "กรุณากรอกชื่อของคุณ" };
  }
  if (!email || !email.includes("@")) {
    return { error: "กรุณากรอกอีเมลให้ถูกต้อง" };
  }
  if (!subject) {
    return { error: "กรุณากรอกหัวข้อ" };
  }
  if (!message) {
    return { error: "กรุณากรอกข้อความ" };
  }

  try {
    await prisma.contactMessage.create({
      data: { name, email, phone: phone || null, subject, message },
    });
    return { success: true };
  } catch (error) {
    console.error("Submit contact message error:", error);
    return { error: "ส่งข้อความไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
}

// ---- Public: /survey form ----
// The form has 5 independent 1-5 star categories, any of which may be left
// at 0 (skipped) — at least one must be rated. 0/undefined is treated as
// "not rated" and stored as null, not as a literal zero score.

type SurveyRatingInput = {
  overall?: number;
  design?: number;
  speed?: number;
  security?: number;
  content?: number;
  comment?: string;
};

function normalizeRating(value: number | undefined): number | null | "invalid" {
  if (value === undefined || value === null || value === 0) return null;
  if (!Number.isInteger(value) || value < 1 || value > 5) return "invalid";
  return value;
}

export async function submitSurveyResponseAction(data: SurveyRatingInput) {
  const overallRating = normalizeRating(data.overall);
  const designRating = normalizeRating(data.design);
  const speedRating = normalizeRating(data.speed);
  const securityRating = normalizeRating(data.security);
  const contentRating = normalizeRating(data.content);

  if (
    overallRating === "invalid" ||
    designRating === "invalid" ||
    speedRating === "invalid" ||
    securityRating === "invalid" ||
    contentRating === "invalid"
  ) {
    return { error: "คะแนนต้องอยู่ระหว่าง 1-5 ดาว" };
  }

  if (
    !overallRating &&
    !designRating &&
    !speedRating &&
    !securityRating &&
    !contentRating
  ) {
    return { error: "กรุณาให้คะแนนอย่างน้อยหนึ่งด้านก่อนส่งแบบประเมิน" };
  }

  const comment = (data.comment || "").trim();

  try {
    await prisma.surveyResponse.create({
      data: {
        overallRating,
        designRating,
        speedRating,
        securityRating,
        contentRating,
        comment: comment || null,
      },
    });
    return { success: true };
  } catch (error) {
    console.error("Submit survey response error:", error);
    return { error: "ส่งแบบประเมินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
}

// ---- Admin ----

export async function getContactMessagesAction() {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ", messages: [] };
  }

  const messages = await prisma.contactMessage.findMany({
    orderBy: { createdAt: "desc" },
  });

  return { messages };
}

function average(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

type CategoryAverages = {
  overall: number | null;
  design: number | null;
  speed: number | null;
  security: number | null;
  content: number | null;
};

function computeCategoryAverages(
  rows: Array<{
    overallRating: number | null;
    designRating: number | null;
    speedRating: number | null;
    securityRating: number | null;
    contentRating: number | null;
  }>,
): CategoryAverages {
  return {
    overall: average(rows.map((r) => r.overallRating)),
    design: average(rows.map((r) => r.designRating)),
    speed: average(rows.map((r) => r.speedRating)),
    security: average(rows.map((r) => r.securityRating)),
    content: average(rows.map((r) => r.contentRating)),
  };
}

// Average of the 5 category averages — not a blended average across every
// individual rating, since each category can have a different number of
// responses (some raters skip categories); averaging the per-category
// averages weighs each category equally regardless of how many people
// rated it.
function computeOverallAverage(averages: CategoryAverages): number | null {
  const values = Object.values(averages).filter(
    (v): v is number => v !== null,
  );
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export async function getSurveyResponsesAction() {
  const session = await auth();
  const emptyAverages: CategoryAverages = {
    overall: null,
    design: null,
    speed: null,
    security: null,
    content: null,
  };

  if (!session || !isAdminRole(session.user.role)) {
    return {
      error: "ไม่มีสิทธิ์ดำเนินการ",
      responses: [],
      total: 0,
      averages: emptyAverages,
      overallAverage: null as number | null,
    };
  }

  const responses = await prisma.surveyResponse.findMany({
    orderBy: { createdAt: "desc" },
  });

  const averages = computeCategoryAverages(responses);

  return {
    responses,
    total: responses.length,
    averages,
    overallAverage: computeOverallAverage(averages),
  };
}

// ---- Public: survey summary stats for the /survey page itself ----
// Deliberately returns only aggregate numbers — no comments or per-response
// detail — since this is reachable without logging in.
const emptySurveyStats = {
  total: 0,
  overallAverage: null as number | null,
  averages: {
    overall: null as number | null,
    design: null as number | null,
    speed: null as number | null,
    security: null as number | null,
    content: null as number | null,
  },
};

export async function getSurveyStatsAction() {
  try {
    const total = await prisma.surveyResponse.count();
    if (total === 0) {
      return emptySurveyStats;
    }

    const rows = await prisma.surveyResponse.findMany({
      select: {
        overallRating: true,
        designRating: true,
        speedRating: true,
        securityRating: true,
        contentRating: true,
      },
    });

    const averages = computeCategoryAverages(rows);

    return {
      total,
      overallAverage: computeOverallAverage(averages),
      averages,
    };
  } catch (error) {
    console.error("Get survey stats error:", error);
    return emptySurveyStats;
  }
}

export async function markContactMessageReadAction(id: string, isRead: boolean) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  try {
    await prisma.contactMessage.update({
      where: { id },
      data: { isRead },
    });
    revalidatePath("/admin/feedback");
    return { success: true };
  } catch (error) {
    console.error("Mark contact message read error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}
