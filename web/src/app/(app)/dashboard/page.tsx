import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";
import { isAdminRole } from "@/lib/permissions";
import { loadDashboardRoomFinder } from "@/lib/room-finder-search";
import { loadDashboardBookings } from "@/lib/room-booking";
import { autoCheckoutExpiredSessionsAction } from "@/actions/sessions";
import { getOcrImportSetupAction } from "@/actions/ocr-timetable";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) redirect("/login");
  if (isAdminRole(session.user.role)) redirect("/admin/dashboard");

  // Lazy cleanup: auto-checkout sessions whose booking time has expired
  autoCheckoutExpiredSessionsAction().catch(() => {});

  // Room Finder opens on the current slot's availability, loaded with the page.
  // Approved GUEST gets it over guest-eligible rooms only; a pending GUEST gets null.
  const now = new Date();
  const roomFinder = await loadDashboardRoomFinder({
    viewer: { role: session.user.role, status: session.user.status },
    now,
  });

  // "การจองของฉัน": the session user's own next PENDING/APPROVED bookings (null = hidden).
  const myBookings = await loadDashboardBookings({
    viewer: { userId: session.user.id, role: session.user.role, status: session.user.status },
    now,
  }).catch((error) => {
    console.error("Dashboard bookings failed:", error);
    return null;
  });

  const ocrSetup = session.user.role === "STUDENT"
    ? await getOcrImportSetupAction()
    : { error: "ไม่เปิดใช้การนำเข้า OCR สำหรับบัญชีนี้" };

  return <DashboardClient user={session.user} roomFinder={roomFinder} myBookings={myBookings} ocrSetup={"error" in ocrSetup ? null : ocrSetup} />;
}
