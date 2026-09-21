import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import {
  ACADEMIC_SLOT_VALUES,
  getSlotDefinition,
  resolveSlotRange,
} from "@/lib/academic-slots";
import type { AcademicSlot } from "@/lib/types";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  const buildingCodes = [
    "A1",
    "A2",
    "A3",
    "A4",
    "A5",
    "A6",
    "A7",
    "A8",
    "B4",
    "C1",
    "C2",
    "C6",
  ];

  // Create Admin user
  const adminPassword = await hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@elegant.com" },
    update: {},
    create: {
      email: "admin@elegant.com",
      name: "System Admin",
      hashedPassword: adminPassword,
      role: "ADMIN",
      status: "APPROVED",
      phone: "02-000-0001",
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);

  // Create Student user
  const staffPassword = await hash("staff123", 12);
  const staff = await prisma.user.upsert({
    where: { email: "staff@elegant.com" },
    update: {
    },
    create: {
      email: "staff@elegant.com",
      name: "Student Member",
      hashedPassword: staffPassword,
      role: "STUDENT",
      status: "APPROVED",
      studentId: "DEMO-STUDENT-001",
      phone: "02-000-0002",
    },
  });
  console.log(`✅ Student created: ${staff.email}`);

  const studentTwoPassword = await hash("student123", 12);
  const studentTwo = await prisma.user.upsert({
    where: { email: "student2@elegant.com" },
    update: {
    },
    create: {
      email: "student2@elegant.com",
      name: "Student Two",
      hashedPassword: studentTwoPassword,
      role: "STUDENT",
      status: "APPROVED",
      studentId: "DEMO-STUDENT-002",
      phone: "02-000-0004",
    },
  });
  console.log(`✅ Student created: ${studentTwo.email}`);

  // Create Guest user
  const guestPassword = await hash("guest123", 12);
  const guest = await prisma.user.upsert({
    where: { email: "guest@example.com" },
    update: {},
    create: {
      email: "guest@example.com",
      name: "Guest User",
      hashedPassword: guestPassword,
      role: "GUEST",
      status: "APPROVED",
      phone: "02-000-0003",
    },
  });
  console.log(`✅ Guest created: ${guest.email}`);

  // Create baseline common rooms
  // Capabilities and bookability are set ONLY for these explicitly known rooms.
  // The generated inventory below stays capabilities = [] / bookingEnabled = false.
  const rooms = [
    {
      name: "ห้องประชุม A",
      roomCode: "MEETING-A",
      description: "ห้องประชุมใหญ่ ชั้น 3",
      capacity: 20,
      guestAccess: true,
      capabilities: ["MEETING"] as const,
      bookingEnabled: true,
      approvalPolicy: "MANUAL" as const,
    },
    {
      name: "ห้องประชุม B",
      roomCode: "MEETING-B",
      description: "ห้องประชุมเล็ก ชั้น 3",
      capacity: 8,
      guestAccess: true,
      capabilities: ["MEETING", "WORKSHOP"] as const,
      bookingEnabled: true,
      approvalPolicy: "AUTO" as const,
    },
    {
      name: "ห้อง Lab",
      roomCode: "LAB-01",
      description: "ห้องปฏิบัติการ ชั้น 2",
      capacity: 15,
      guestAccess: false,
      capabilities: ["LAB", "CLASSROOM"] as const,
      bookingEnabled: true,
      approvalPolicy: "AUTO" as const,
    },
    {
      name: "ห้อง Server",
      roomCode: "SERVER-01",
      description: "ห้อง Server Room - เฉพาะ Staff",
      capacity: 5,
      guestAccess: false,
      capabilities: ["LAB"] as const,
      bookingEnabled: false,
      approvalPolicy: "MANUAL" as const,
    },
  ];

  for (const room of rooms) {
    const data = {
      name: room.name,
      description: room.description,
      capacity: room.capacity,
      guestAccess: room.guestAccess,
      capabilities: [...room.capabilities],
      bookingEnabled: room.bookingEnabled,
      approvalPolicy: room.approvalPolicy,
    };

    await prisma.room.upsert({
      where: { roomCode: room.roomCode },
      update: data,
      create: { roomCode: room.roomCode, ...data },
    });
    console.log(`✅ Room created: ${room.name} (${room.roomCode})`);
  }

  // Create long-term room inventory by building/floor/room
  let generatedCount = 0;
  for (const building of buildingCodes) {
    const maxFloors = building === "B4" ? 6 : 4;
    for (let floor = 1; floor <= maxFloors; floor += 1) {
      for (let roomNo = 1; roomNo <= 8; roomNo += 1) {
        const roomCode = `${building}-${floor}${String(roomNo).padStart(2, "0")}`;
        const roomName = `อาคาร ${building} ชั้น ${floor} ห้อง ${String(roomNo).padStart(2, "0")}`;

        await prisma.room.upsert({
          where: { roomCode },
          update: {
            name: roomName,
            description: `อาคาร ${building} ชั้น ${floor}`,
            building,
            floor,
          },
          create: {
            name: roomName,
            roomCode,
            description: `อาคาร ${building} ชั้น ${floor}`,
            capacity: 40,
            guestAccess: false,
            staffOnly: false,
            isActive: true,
            building,
            floor,
            // capabilities and bookingEnabled intentionally left at their defaults
            // ([] and false): nothing is assumed about generated inventory.
          },
        });
        generatedCount += 1;
      }
    }
  }
  console.log(`✅ Generated room inventory: ${generatedCount} rooms`);

  // Create deterministic synthetic schedules for local UI and access-flow testing.
  const scheduleRoomCodes = ["LAB-01", "MEETING-A", "MEETING-B"];
  const seededRooms = await prisma.room.findMany({
    where: { roomCode: { in: scheduleRoomCodes } },
    select: { id: true, roomCode: true },
  });
  const roomByCode = new Map(seededRooms.map((room) => [room.roomCode, room.id]));

  // Times are derived from the academic slot grid - no time literals here.
  const demoSchedules: Array<{
    id: string;
    userId: string;
    roomCode: string;
    dayOfWeek: number;
    slot: AcademicSlot;
    section: string;
    subjectName: string;
    subjectCode: string;
    semester: string;
  }> = [
    {
      id: "demo-schedule-staff-mon-1",
      userId: staff.id,
      roomCode: "LAB-01",
      dayOfWeek: 1,
      slot: "SLOT_1",
      section: "DEMO-A",
      subjectName: "การเขียนโปรแกรมเบื้องต้น",
      subjectCode: "DEMO101",
      semester: "2/2026",
    },
    {
      id: "demo-schedule-staff-mon-2",
      userId: staff.id,
      roomCode: "MEETING-A",
      dayOfWeek: 1,
      slot: "SLOT_2",
      section: "DEMO-A",
      subjectName: "การออกแบบระบบ",
      subjectCode: "DEMO102",
      semester: "2/2026",
    },
    {
      id: "demo-schedule-student2-tue-1",
      userId: studentTwo.id,
      roomCode: "LAB-01",
      dayOfWeek: 2,
      slot: "SLOT_1",
      section: "DEMO-B",
      subjectName: "ฐานข้อมูลสำหรับการทดสอบ",
      subjectCode: "DEMO201",
      semester: "2/2026",
    },
    {
      // Same student, same day, same slot, different room - the time-conflict case.
      id: "demo-schedule-student2-tue-conflict",
      userId: studentTwo.id,
      roomCode: "MEETING-B",
      dayOfWeek: 2,
      slot: "SLOT_1",
      section: "DEMO-C",
      subjectName: "กรณีทดสอบเวลาชนกัน",
      subjectCode: "DEMO202",
      semester: "2/2026",
    },
    {
      id: "demo-schedule-staff-wed-quick-access",
      userId: staff.id,
      roomCode: "LAB-01",
      dayOfWeek: 3,
      slot: "SLOT_3",
      section: "DEMO-A",
      subjectName: "กรณีทดสอบ Quick Access",
      subjectCode: "DEMO301",
      semester: "2/2026",
    },
    {
      id: "demo-schedule-student2-old-semester",
      userId: studentTwo.id,
      roomCode: "MEETING-A",
      dayOfWeek: 4,
      slot: "SLOT_1",
      section: "DEMO-B",
      subjectName: "ข้อมูลคนละภาคการศึกษา",
      subjectCode: "DEMO401",
      semester: "1/2026",
    },
  ];

  for (const schedule of demoSchedules) {
    const roomId = roomByCode.get(schedule.roomCode);
    if (!roomId) {
      throw new Error(`Missing seeded room: ${schedule.roomCode}`);
    }

    const { startTime, endTime } = getSlotDefinition(schedule.slot);
    const data = {
      userId: schedule.userId,
      roomId,
      dayOfWeek: schedule.dayOfWeek,
      startTime,
      endTime,
      slot: schedule.slot,
      section: schedule.section,
      subjectName: schedule.subjectName,
      subjectCode: schedule.subjectCode,
      semester: schedule.semester,
    };

    await prisma.classSchedule.upsert({
      where: { id: schedule.id },
      update: data,
      create: { id: schedule.id, ...data },
    });
  }

  console.log(`✅ Seeded deterministic demo schedules: ${demoSchedules.length}`);

  // Availability is FAIL-CLOSED: a bookable room with no windows is "not
  // configured" and therefore not bookable. Every permitted day/slot is explicit.
  const availabilityPlan: Array<{ roomCode: string; days: number[]; slots: AcademicSlot[] }> = [
    { roomCode: "LAB-01", days: [1, 2, 3, 4, 5], slots: [...ACADEMIC_SLOT_VALUES] },
    { roomCode: "MEETING-A", days: [1, 2, 3, 4, 5], slots: ["SLOT_1", "SLOT_2", "SLOT_3"] },
    { roomCode: "MEETING-B", days: [1, 2, 3, 4, 5, 6], slots: [...ACADEMIC_SLOT_VALUES] },
  ];

  let windowCount = 0;
  for (const plan of availabilityPlan) {
    const roomId = roomByCode.get(plan.roomCode);
    if (!roomId) {
      throw new Error(`Missing seeded room: ${plan.roomCode}`);
    }

    for (const dayOfWeek of plan.days) {
      for (const slot of plan.slots) {
        await prisma.roomAvailabilityWindow.upsert({
          where: { roomId_dayOfWeek_slot: { roomId, dayOfWeek, slot } },
          update: {},
          create: { roomId, dayOfWeek, slot },
        });
        windowCount += 1;
      }
    }
  }
  console.log(`✅ Seeded availability windows: ${windowCount}`);

  // Deterministic demo bookings. 2026-09-28 is a Monday, inside every window above.
  const bookingDateIso = "2026-09-28";
  const bookingDate = new Date(`${bookingDateIso}T00:00:00Z`);
  const decidedAt = new Date("2026-09-22T03:00:00Z");

  const demoBookings: Array<{
    id: string;
    roomCode: string;
    userId: string;
    slots: AcademicSlot[];
    partySize: number;
    purpose: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    decidedAt?: Date;
    cancelledAt?: Date;
  }> = [
    {
      id: "demo-booking-pending",
      roomCode: "MEETING-A", // MANUAL policy -> stays pending
      userId: staff.id,
      slots: ["SLOT_1"],
      partySize: 6,
      purpose: "ประชุมกลุ่มโครงงาน",
      status: "PENDING",
    },
    {
      id: "demo-booking-approved",
      roomCode: "LAB-01", // AUTO policy -> auto-approved, decidedById stays null
      userId: studentTwo.id,
      slots: ["SLOT_3"],
      partySize: 10,
      purpose: "ทบทวนปฏิบัติการ",
      status: "APPROVED",
      decidedAt,
    },
    {
      id: "demo-booking-cancelled",
      roomCode: "MEETING-B",
      userId: staff.id,
      slots: ["SLOT_2"],
      partySize: 4,
      purpose: "นัดหมายที่ถูกยกเลิก",
      status: "CANCELLED",
      cancelledAt: decidedAt,
    },
    {
      id: "demo-booking-multislot",
      roomCode: "LAB-01",
      userId: studentTwo.id,
      slots: ["SLOT_1", "SLOT_2"],
      partySize: 8,
      purpose: "เวิร์กช็อปต่อเนื่องสองคาบ",
      status: "APPROVED",
      decidedAt,
    },
  ];

  for (const booking of demoBookings) {
    const roomId = roomByCode.get(booking.roomCode);
    if (!roomId) {
      throw new Error(`Missing seeded room: ${booking.roomCode}`);
    }

    const data = {
      roomId,
      userId: booking.userId,
      date: bookingDate,
      partySize: booking.partySize,
      purpose: booking.purpose,
      status: booking.status,
      decidedAt: booking.decidedAt ?? null,
      cancelledAt: booking.cancelledAt ?? null,
    };

    await prisma.roomBooking.upsert({
      where: { id: booking.id },
      update: data,
      create: { id: booking.id, ...data },
    });

    for (const slot of booking.slots) {
      const { startAt, endAt } = resolveSlotRange(bookingDateIso, slot);
      await prisma.roomBookingSlot.upsert({
        where: { bookingId_slot: { bookingId: booking.id, slot } },
        update: { startAt, endAt },
        create: { bookingId: booking.id, slot, startAt, endAt },
      });
    }
  }
  console.log(`✅ Seeded demo room bookings: ${demoBookings.length}`);

  // Slot-specific closure: LAB-01 is closed for SLOT_3 only, on one day.
  const closureRoomId = roomByCode.get("LAB-01");
  if (!closureRoomId) {
    throw new Error("Missing seeded room: LAB-01");
  }

  const closureData = {
    roomId: closureRoomId,
    startDate: new Date("2026-09-29T00:00:00Z"),
    endDate: new Date("2026-09-29T00:00:00Z"),
    slots: ["SLOT_3"] as AcademicSlot[],
    reason: "ปิดปรับปรุงอุปกรณ์ช่วงคาบ 3",
  };

  await prisma.roomClosure.upsert({
    where: { id: "demo-closure-lab01-slot3" },
    update: closureData,
    create: { id: "demo-closure-lab01-slot3", ...closureData },
  });
  console.log("✅ Seeded demo room closure: 1");

  // The availability engine scopes class schedules to this semester, so the
  // deterministic local demo needs it set without manual configuration.
  await prisma.systemSetting.upsert({
    where: { key: "ACTIVE_SEMESTER" },
    update: { value: "2/2026" },
    create: { key: "ACTIVE_SEMESTER", value: "2/2026" },
  });
  console.log("✅ Seeded system setting: ACTIVE_SEMESTER=2/2026");

  console.log("\n🎉 Seeding completed!");
  console.log("\n📋 Test Accounts:");
  console.log("  Admin: admin@elegant.com / admin123");
  console.log("  Student 1: staff@elegant.com / staff123 (DEMO-STUDENT-001)");
  console.log("  Student 2: student2@elegant.com / student123 (DEMO-STUDENT-002)");
  console.log("  Guest: guest@example.com / guest123");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
