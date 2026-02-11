import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  Shield,
  QrCode,
  Users,
  DoorOpen,
  BarChart3,
  Lock,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden flex justify-center">
        <div className="w-full max-w-7xl p-4 sm:p-6 lg:p-8 h-[60vh] flex justify-between items-center">
          <div className="">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              <span className="text-(--color-primary)">Elegant Solutions</span>
              <br />
              ระบบจัดการการเข้าถึงห้องอัจฉริยะ
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-gray-600">
              จัดการสิทธิ์การเข้าถึงห้องประชุม ห้องทำงาน
              ด้วยระบบ QR Code ที่ปลอดภัยและใช้งานง่าย
            </p>
            <div className="mt-10 flex items-center gap-4">
              <Link href="/register" className="btn-primary text-base px-12 py-3 rounded-full">
                เริ่มต้นใช้งาน
              </Link>
              {/* <Link href="/login" className="btn-secondary text-base px-8 py-3">
                เข้าสู่ระบบ
              </Link> */}
            </div>
          </div>
          <img className="w-[400px] h-auto" src="https://cdn.aona.co.th/u/nicenathapong/files/7b218a3b4841ab5190d0f423aab526eea8513101990648589b0d3b167dbaa5a6.png" alt="hero_image" />
        </div>

        {/* Decorative gradient */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-linear-to-b from-(--color-primary-light) to-transparent" />
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">
              ฟีเจอร์หลัก
            </h2>
            <p className="mt-4 text-gray-600">
              ระบบครบวงจรสำหรับการจัดการห้องและการเข้าถึง
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<QrCode className="h-8 w-8" />}
              title="QR Code Access"
              description="สร้างและสแกน QR Code สำหรับเข้า-ออกห้องได้อย่างรวดเร็ว"
            />
            <FeatureCard
              icon={<Users className="h-8 w-8" />}
              title="Group Access"
              description="สร้างกลุ่มและแชร์สิทธิ์การเข้าห้องให้ทีมได้ง่ายๆ"
            />
            <FeatureCard
              icon={<DoorOpen className="h-8 w-8" />}
              title="Gate Kiosk"
              description="ระบบ Kiosk หน้าห้องสำหรับสแกนและจัดการเข้า-ออก"
            />
            <FeatureCard
              icon={<Shield className="h-8 w-8" />}
              title="Role-Based Access"
              description="ระบบ RBAC ที่แบ่ง Admin, Staff, Guest อย่างชัดเจน"
            />
            <FeatureCard
              icon={<BarChart3 className="h-8 w-8" />}
              title="Reports & Logs"
              description="ดูรายงานและ Export Excel ได้ทันที"
            />
            <FeatureCard
              icon={<Lock className="h-8 w-8" />}
              title="AI Ready (Phase 2)"
              description="เตรียมพร้อมสำหรับ Face Recognition ในอนาคต"
            />
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="card max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              ติดต่อเรา
            </h2>
            <p className="text-gray-600 mb-6">
              สนใจใช้งานระบบ Elegant Solutions
              ติดต่อทีมงานของเราได้ที่
            </p>
            <div className="space-y-2 text-gray-700">
              <p>📧 contact@elegant-solutions.com</p>
              <p>📞 02-xxx-xxxx</p>
              <p>🏢 กรุงเทพมหานคร, ประเทศไทย</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-gray-500">
          © 2026 Elegant Solutions. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="mb-4 text-(--color-secondary)">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}
