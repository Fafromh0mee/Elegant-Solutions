import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  Shield,
  QrCode,
  Users,
  DoorOpen,
  BarChart3,
  Lock,
  GraduationCap,
  Building2,
  Hospital,
  Factory,
  Briefcase,
  Landmark,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden flex justify-center">
        <div className="w-full max-w-7xl p-4 sm:p-6 lg:p-8 min-h-[50vh] lg:h-[60vh] flex flex-col lg:flex-row justify-center lg:justify-between items-center gap-8 lg:gap-12">
          <div className="text-center lg:text-left h-fit z-10">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900">
              <span className="text-(--color-primary)">Elegant Solutions</span>
              <br />
              ระบบบริหารจัดการห้อง LAB อัจฉริยะ
            </h1>
            <p className="mt-4 sm:mt-6 max-w-2xl text-base sm:text-lg text-gray-600 mx-auto lg:mx-0">
              จัดการสิทธิ์การเข้าถึงห้องประชุม ห้องทำงาน
              ด้วยระบบ AI Face Recognition และ QR Code ที่ปลอดภัยและใช้งานง่าย
            </p>
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4">
              <Link href="/register" className="btn-primary text-sm sm:text-base px-8 sm:px-12 py-2.5 sm:py-3 rounded-full w-full sm:w-auto">
                เริ่มต้นใช้งาน
              </Link>
              {/* <Link href="/login" className="btn-secondary text-base px-8 py-3">
                เข้าสู่ระบบ
              </Link> */}
            </div>
          </div>
          <div className="hidden lg:block w-[350px] lg:w-96 lg:max-w-none">
            <img 
              className="w-full h-auto" 
              src="https://cdn.aona.co.th/u/nicenathapong/files/7b218a3b4841ab5190d0f423aab526eea8513101990648589b0d3b167dbaa5a6.png" 
              alt="hero_image" 
            />
          </div>
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
              icon={<QrCode className="h-12 w-12" />}
              title="QR Code Access"
              description="สร้างและสแกน QR Code สำหรับเข้า-ออกห้องได้อย่างรวดเร็ว"
            />
            <FeatureCard
              icon={<Users className="h-12 w-12" />}
              title="Group Access"
              description="สร้างกลุ่มและแชร์สิทธิ์การเข้าห้องให้ทีมได้ง่ายๆ"
            />
            <FeatureCard
              icon={<DoorOpen className="h-12 w-12" />}
              title="Gate Kiosk"
              description="ระบบ Kiosk หน้าห้องสำหรับสแกนและจัดการเข้า-ออก"
            />
            <FeatureCard
              icon={<Shield className="h-12 w-12" />}
              title="Role-Based Access"
              description="ระบบ RBAC ที่แบ่ง Admin, Staff, Guest อย่างชัดเจน"
            />
            <FeatureCard
              icon={<BarChart3 className="h-12 w-12" />}
              title="Reports & Logs"
              description="ดูรายงานและ Export Excel ได้ทันที"
            />
            <FeatureCard
              icon={<Lock className="h-12 w-12" />}
              title="AI Face Recognition"
              description="ระบบ AI Face Recognition ที่แม่นยำและรวดเร็ว"
            />
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">
              ตอบโจทย์ทุกประเภทองค์กร
            </h2>
            <p className="mt-4 text-gray-600">
              ไม่ว่าคุณจะเป็นสถาบันการศึกษา บริษัท หรือหน่วยงานราชการ
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <UseCaseCard
              icon={<GraduationCap className="h-12 w-12" />}
              title="สถาบันการศึกษา"
              description="จัดการห้อง LAB, ห้องเรียน และห้องประชุม ควบคุมสิทธิ์นักศึกษาและอาจารย์ได้อย่างมีประสิทธิภาพ"
            />
            <UseCaseCard
              icon={<Building2 className="h-12 w-12" />}
              title="บริษัทและองค์กร"
              description="บริหารจัดการห้องประชุม ห้องทำงาน พร้อมระบบรายงานการใช้งานแบบ Real-time"
            />
            <UseCaseCard
              icon={<Hospital className="h-12 w-12" />}
              title="โรงพยาบาล / คลินิก"
              description="ควบคุมการเข้าออกห้องตรวจ ห้องปฏิบัติการ ด้วยระบบรักษาความปลอดภัยสูง"
            />
            <UseCaseCard
              icon={<Factory className="h-12 w-12" />}
              title="โรงงานอุตสาหกรรม"
              description="จัดการสิทธิ์เข้าโซนอันตราย ห้องควบคุม และพื้นที่จำกัดสิทธิ์"
            />
            <UseCaseCard
              icon={<Briefcase className="h-12 w-12" />}
              title="Co-Working Space"
              description="ให้บริการจองห้องและเช็คอินอัตโนมัติ สะดวกทั้งผู้ให้บริการและลูกค้า"
            />
            <UseCaseCard
              icon={<Landmark className="h-12 w-12" />}
              title="หน่วยงานราชการ"
              description="ระบบรักษาความปลอดภัย พร้อม Log การเข้าออกที่สามารถตรวจสอบย้อนหลังได้"
            />
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">
              ทำไมต้อง Elegant Solutions
            </h2>
            <p className="mt-4 text-gray-600">
              เหนือกว่าระบบบริหารจัดการห้องทั่วไป
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <BenefitCard
              title="ประหยัดเวลา"
              description="ลดขั้นตอนการขอสิทธิ์และเข้าห้อง ไม่ต้องรอเจ้าหน้าที่อนุมัติ"
            />
            <BenefitCard
              title="ปลอดภัยสูง"
              description="ระบบ AI Face Recognition และ QR Code ป้องกันการปลอมแปลงตัวตน"
            />
            <BenefitCard
              title="ตรวจสอบได้"
              description="บันทึก Log ทุกการเข้าออก Export รายงานได้ทันทีเมื่อต้องการ"
            />
            <BenefitCard
              title="ใช้งานง่าย"
              description="UI/UX ที่เข้าใจง่าย เหมาะกับทุกวัย ไม่ต้องอบรมซับซ้อน"
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
              <p>📧 nantita.damr@bumail.net</p>
              <p>📞 061-021-xxxx</p>
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

function UseCaseCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card hover:shadow-lg transition-shadow text-center">
      <div className="mb-4 text-(--color-primary) flex justify-center">{icon}</div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

function BenefitCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="card border-l-4 border-(--color-primary)">
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
