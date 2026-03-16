import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import { isAdminRole } from "@/lib/permissions";

export async function GET() {
  const session = await auth();

  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessions = await prisma.session.findMany({
      include: {
        user: { select: { name: true, email: true, role: true } },
        room: { select: { name: true, roomCode: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Elegant Solutions";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Sessions Report");

    // Header
    worksheet.columns = [
      { header: "ลำดับ", key: "index", width: 8 },
      { header: "ชื่อผู้ใช้", key: "userName", width: 25 },
      { header: "อีเมล", key: "userEmail", width: 30 },
      { header: "บทบาท", key: "userRole", width: 10 },
      { header: "ห้อง", key: "roomName", width: 20 },
      { header: "รหัสห้อง", key: "roomCode", width: 15 },
      { header: "Check-in", key: "checkIn", width: 22 },
      { header: "Check-out", key: "checkOut", width: 22 },
      { header: "สถานะ", key: "status", width: 12 },
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

    // Data
    sessions.forEach((s: { user: { name: string; email: string; role: string }; room: { name: string; roomCode: string }; checkIn: Date; checkOut: Date | null; status: string }, i: number) => {
      worksheet.addRow({
        index: i + 1,
        userName: s.user.name,
        userEmail: s.user.email,
        userRole: s.user.role,
        roomName: s.room.name,
        roomCode: s.room.roomCode,
        checkIn: new Date(s.checkIn).toLocaleString("th-TH"),
        checkOut: s.checkOut
          ? new Date(s.checkOut).toLocaleString("th-TH")
          : "-",
        status: s.status === "ACTIVE" ? "ใช้งานอยู่" : "เสร็จสิ้น",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="sessions-report-${
          new Date().toISOString().split("T")[0]
        }.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
