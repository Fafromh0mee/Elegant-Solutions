import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

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
      phone: "02-000-0001",
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);

  // Create Staff user
  const staffPassword = await hash("staff123", 12);
  const staff = await prisma.user.upsert({
    where: { email: "staff@elegant.com" },
    update: {},
    create: {
      email: "staff@elegant.com",
      name: "Staff Member",
      hashedPassword: staffPassword,
      role: "STAFF",
      phone: "02-000-0002",
    },
  });
  console.log(`✅ Staff created: ${staff.email}`);

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
      phone: "02-000-0003",
    },
  });
  console.log(`✅ Guest created: ${guest.email}`);

  // Create Rooms
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

  console.log("\n🎉 Seeding completed!");
  console.log("\n📋 Test Accounts:");
  console.log("  Admin: admin@elegant.com / admin123");
  console.log("  Staff: staff@elegant.com / staff123");
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
