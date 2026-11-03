import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { getSystemDiagnostics } from "@/lib/system-diagnostics";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(await getSystemDiagnostics(), {
    headers: { "Cache-Control": "no-store" },
  });
}
