import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Agent login — validates email + password and returns basic user info.
 * Does NOT create a NextAuth session (agent keeps its own state).
 */
export async function POST(req: NextRequest) {
  let body: { email: string; password: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      hashedPassword: true,
      status: true,
      role: true,
    },
  });

  if (!user || !user.hashedPassword) {
    return NextResponse.json(
      { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
      { status: 401 },
    );
  }

  if (user.status !== "APPROVED") {
    return NextResponse.json(
      { error: "บัญชีของคุณยังไม่ได้รับการอนุมัติ" },
      { status: 403 },
    );
  }

  const valid = await compare(password, user.hashedPassword);
  if (!valid) {
    return NextResponse.json(
      { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}
