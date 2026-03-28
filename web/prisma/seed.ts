import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

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
      studentId: "1660708635",
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
      studentId: "1660703413",
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
  const rooms = [
    {
      name: "ห้องประชุม A",
      roomCode: "MEETING-A",
      description: "ห้องประชุมใหญ่ ชั้น 3",
      capacity: 20,
      guestAccess: true,
    },
    {
      name: "ห้องประชุม B",
      roomCode: "MEETING-B",
      description: "ห้องประชุมเล็ก ชั้น 3",
      capacity: 8,
      guestAccess: true,
    },
    {
      name: "ห้อง Lab",
      roomCode: "LAB-01",
      description: "ห้องปฏิบัติการ ชั้น 2",
      capacity: 15,
      guestAccess: false,
    },
    {
      name: "ห้อง Server",
      roomCode: "SERVER-01",
      description: "ห้อง Server Room - เฉพาะ Staff",
      capacity: 5,
      guestAccess: false,
    },
  ];

  for (const room of rooms) {
    await prisma.room.upsert({
      where: { roomCode: room.roomCode },
      update: {},
      create: room,
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
          },
          create: {
            name: roomName,
            roomCode,
            description: `อาคาร ${building} ชั้น ${floor}`,
            capacity: 40,
            guestAccess: false,
            staffOnly: false,
            isActive: true,
          },
        });
        generatedCount += 1;
      }
    }
  }
  console.log(`✅ Generated room inventory: ${generatedCount} rooms`);

  console.log("\n🎉 Seeding completed!");
  console.log("\n📋 Test Accounts:");
  console.log("  Admin: admin@elegant.com / admin123");
  console.log("  Student 1: staff@elegant.com / staff123 (1660708635)");
  console.log("  Student 2: student2@elegant.com / student123 (1660703412)");
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
