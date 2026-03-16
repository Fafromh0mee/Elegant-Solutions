"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import React from "react";
import { Navbar } from "@/components/navbar";
import {
  Shield,
  Users,
  DoorOpen,
  GraduationCap,
  Building2,
  Hospital,
  Factory,
  Briefcase,
  Landmark,
  ScanFace,
  CalendarClock,
  History,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

const mainFeatures = [
  {
    icon: <ScanFace className="h-6 w-6" />,
    eyebrow: "Identity Verification",
    title: "ยืนยันตัวตนได้หลายรูปแบบในระบบเดียว",
    description:
      "รองรับ AI Face Recognition, QR Code และจุดสแกนหน้าห้อง เพื่อให้หน้างานลื่นขึ้นโดยไม่ต้องสลับหลายระบบ",
  },
  {
    icon: <CalendarClock className="h-6 w-6" />,
    eyebrow: "Schedule Control",
    title: "กำหนดสิทธิ์ตามเวลาและตารางใช้งานจริง",
    description:
      "จัดการสิทธิ์รายห้อง รายกลุ่ม หรือรายบุคคลตามช่วงเวลา ลดปัญหาการเข้าห้องผิดรอบและสิทธิ์ค้าง",
  },
  {
    icon: <Users className="h-6 w-6" />,
    eyebrow: "Centralized Access",
    title: "ดูแลสิทธิ์ผู้ใช้งานทั้งองค์กรจากศูนย์กลาง",
    description:
      "รองรับ role, group และ workflow การอนุมัติ ช่วยให้ผู้ดูแลควบคุมการเข้าถึงได้เป็นระบบมากขึ้น",
  },
  {
    icon: <History className="h-6 w-6" />,
    eyebrow: "Audit Trail",
    title: "ตรวจสอบย้อนหลังได้ทุกเหตุการณ์สำคัญ",
    description:
      "มี log การเข้าออกและข้อมูลพร้อม export สำหรับงานตรวจสอบภายใน รายงานบริหาร และติดตามเหตุการณ์ย้อนหลัง",
  },
  {
    icon: <DoorOpen className="h-6 w-6" />,
    eyebrow: "On-site Experience",
    title: "ออกแบบเพื่อการใช้งานหน้าห้องที่รวดเร็ว",
    description:
      "รองรับจุด Kiosk และ flow การใช้งานจริง ช่วยลดคิว ลดภาระเจ้าหน้าที่ และทำให้ผู้ใช้งานเข้าห้องได้ไวขึ้น",
  },
  {
    icon: <Shield className="h-6 w-6" />,
    eyebrow: "Security First",
    title: "เพิ่มความปลอดภัยโดยไม่เพิ่มความยุ่งยาก",
    description:
      "เหมาะกับองค์กรที่ต้องการทั้งความคล่องตัวในการใช้งาน และมาตรฐานการควบคุมสิทธิ์ที่ชัดเจน",
  },
] as const;

const benefitPoints = [
  {
    number: "01",
    title: "ลดภาระงานแอดมินในทุกวัน",
    description:
      "รวมการจัดการห้อง ผู้ใช้ สิทธิ์ และประวัติการใช้งานไว้ในระบบเดียว ไม่ต้องตามงานผ่านหลายช่องทาง",
  },
  {
    number: "02",
    title: "พร้อมใช้กับพื้นที่ที่ต้องคุมสิทธิ์",
    description:
      "รองรับตั้งแต่ห้อง LAB ห้องประชุม ไปจนถึงพื้นที่เฉพาะทางที่ต้องรู้ว่าใครเข้าออกเมื่อไร",
  },
  {
    number: "03",
    title: "รองรับการเติบโตในอนาคต",
    description:
      "เริ่มจาก use case เล็กก่อน แล้วค่อยต่อยอดไปหลายห้อง หลายอาคาร หรือหลายแผนกได้โดยไม่ต้องเปลี่ยนวิธีคิดใหม่",
  },
  {
    number: "04",
    title: "ข้อมูลพร้อมต่อยอดได้จริง",
    description:
      "เห็นภาพการใช้งานห้อง ช่วงเวลาที่มีความหนาแน่น และพฤติกรรมการเข้าใช้งานเพื่อนำไปปรับนโยบายได้จริง",
  },
] as const;

const faqs = [
  {
    question: "ระบบนี้เหมาะกับองค์กรแบบไหนบ้าง",
    answer:
      "เหมาะกับสถาบันการศึกษา บริษัท โรงพยาบาล โรงงาน และหน่วยงานที่มีห้องหรือพื้นที่ที่ต้องควบคุมสิทธิ์การเข้าใช้งานอย่างชัดเจน",
  },
  {
    question: "จำเป็นต้องใช้ AI Face Recognition อย่างเดียวหรือไม่",
    answer:
      "ไม่จำเป็น ระบบรองรับหลายรูปแบบ เช่น AI Face Recognition, QR Code และจุด Kiosk หน้าห้อง เพื่อให้เลือกใช้ตามบริบทของหน้างานได้",
  },
  {
    question: "สามารถตรวจสอบว่าใครเข้าออกห้องเมื่อไรได้หรือไม่",
    answer:
      "ได้ ระบบบันทึก log การเข้าออกและข้อมูลสำคัญไว้สำหรับการตรวจสอบย้อนหลัง รวมถึงรองรับการนำข้อมูลไปทำรายงานต่อได้",
  },
  {
    question: "ถ้ามีหลายห้องหรือหลายแผนก ระบบยังจัดการง่ายอยู่ไหม",
    answer:
      "ยังจัดการได้จากศูนย์กลาง โดยแยกสิทธิ์ตามห้อง กลุ่มผู้ใช้ หรือบทบาทการใช้งาน ทำให้ขยายการดูแลไปทั้งองค์กรได้ง่ายขึ้น",
  },
] as const;

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
              จัดการสิทธิ์การเข้าถึงห้องประชุม ห้องทำงาน ด้วยระบบ AI Face
              Recognition และ QR Code ที่ปลอดภัยและใช้งานง่าย
            </p>
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4">
              <Link
                href="/register"
                className="btn-primary text-sm sm:text-base px-8 sm:px-12 py-2.5 sm:py-3 rounded-full w-full sm:w-auto"
              >
                เริ่มต้นใช้งาน
              </Link>
              {/* <Link href="/login" className="btn-secondary text-base px-8 py-3">
                เข้าสู่ระบบ
              </Link> */}
            </div>
          </div>
          <div className="hidden lg:block w-87.5 lg:w-96 lg:max-w-none">
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
          <div className="mx-auto max-w-2xl text-center mb-16">
            <span className="badge-admin">Core Value</span>
            <h2 className="mt-5 text-3xl font-bold text-gray-900 sm:text-4xl">
              ฟีเจอร์หลักที่ช่วยให้ระบบนี้น่าใช้งานจริงในองค์กร
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Elegant Solutions ไม่ใช่แค่ระบบเปิดประตูหรือจองห้อง
              แต่เป็นแพลตฟอร์มที่ช่วยให้การควบคุมสิทธิ์ การใช้งานหน้างาน
              และการตรวจสอบย้อนหลังอยู่ในที่เดียว
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {mainFeatures.map((feature) => (
              <FeatureSellingCard
                key={feature.title}
                icon={feature.icon}
                eyebrow={feature.eyebrow}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="py-24 bg-linear-to-b from-gray-50 to-blue-50">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div className="lg:pr-10">
            <span className="badge-admin">Use Cases</span>
            <h2 className="mt-5 text-3xl font-bold text-gray-900 sm:text-4xl">
              ตอบโจทย์ทุกประเภทองค์กร
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              ไม่ว่าคุณจะเป็นสถาบันการศึกษา บริษัท โรงพยาบาล โรงงาน
              หรือหน่วยงานราชการ ระบบ Elegant Solutions
              ติดตั้งและใช้งานได้จริงกับความต้องการของแต่ละสถาบัน
            </p>

            <div className="mt-8 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-2xl font-bold text-(--color-cta)">
                  6 Industries
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  รองรับการใช้งานจริงทั่วเรื่องประเภทขององค์กร
                </p>
              </div>
              <div className="rounded-3xl bg-(--color-primary) p-6 text-white shadow-lg shadow-slate-200/60">
                <p className="text-sm text-white/70">สิ่งที่เหมือนกัน</p>
                <p className="mt-2 text-lg font-semibold leading-8">
                  ทุกองค์กรต้องการความปลอดภัย ติดตามการเข้าถึง
                  และควบคุมสิทธิ์ได้
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
      <section className="py-24 bg-linear-to-b from-white to-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <span className="badge-admin">Why Us</span>
            <h2 className="mt-5 text-3xl font-bold text-gray-900 sm:text-4xl">
              ทำไมต้อง Elegant Solutions
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              เพราะองค์กรไม่ได้ต้องการแค่ระบบสำหรับเปิดห้อง
              แต่ต้องการระบบที่ดูแลตั้งแต่ การกำหนดสิทธิ์ การใช้งานหน้างาน
              ไปจนถึงการตรวจสอบย้อนหลังแบบครบวงจร
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
            {benefitPoints.map((item) => (
              <BenefitTimelineCard
                key={item.number}
                number={item.number}
                title={item.title}
                description={item.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="badge-admin">FAQ</span>
            <h2 className="mt-5 text-3xl font-bold text-gray-900 sm:text-4xl">
              คำถามที่พบบ่อย
            </h2>
            <p className="mt-4 text-gray-600">
              สำหรับคำถามที่มักใช้ประกอบการตัดสินใจก่อนเริ่มใช้งาน
            </p>
          </div>

          <div className="mt-12 space-y-4">
            {faqs.map((item) => (
              <FaqItem
                key={item.question}
                question={item.question}
                answer={item.answer}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-(--color-primary-light) text-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row gap-8 mb-8">
            {/* Brand */}
            <div className="md:min-w-[60%]">
              <h3 className="text-lg font-bold text-(--color-primary) mb-4">
                Elegant Solutions
              </h3>
              <p className="text-sm leading-6 text-gray-700">
                ระบบบริหารจัดการห้องและสิทธิ์การเข้าถึง
                ออกแบบมาเพื่อองค์กรสมัยใหม่
              </p>
            </div>
            <div className="md:w-full grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Navigation */}
              <div>
                <h4 className="text-sm font-semibold text-(--color-primary) mb-4">
                  เนื้อหา
                </h4>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a
                      href="#"
                      className="text-gray-700 hover:text-(--color-primary) transition-colors"
                    >
                      ฟีเจอร์หลัก
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="text-gray-700 hover:text-(--color-primary) transition-colors"
                    >
                      Use Cases
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="text-gray-700 hover:text-(--color-primary) transition-colors"
                    >
                      FAQ
                    </a>
                  </li>
                </ul>
              </div>

              {/* Contact */}
              <div>
                <h4 className="text-sm font-semibold text-(--color-primary) mb-4">
                  ติดต่อเรา
                </h4>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a
                      href="mailto:nantita.damr@bumail.net"
                      className="text-gray-700 hover:text-(--color-primary) transition-colors"
                    >
                      nantita.damr@bumail.net
                    </a>
                  </li>
                  <li>
                    <a
                      href="tel:061021xxxx"
                      className="text-gray-700 hover:text-(--color-primary) transition-colors"
                    >
                      061-021-xxxx
                    </a>
                  </li>
                  <li className="text-gray-600">กรุงเทพมหานคร, ประเทศไทย</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-300 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <p className="text-sm text-gray-600">
                © 2026 Elegant Solutions. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureSellingCard({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--color-primary-light) text-(--color-cta)">
        {icon}
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-(--color-secondary)">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-xl font-semibold leading-8 text-gray-900">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>
    </div>
  );
}

function UseCaseCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card hover:shadow-lg transition-shadow text-center">
      <div className="mb-4 text-(--color-primary) flex justify-center">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

function BenefitTimelineCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--color-primary) text-sm font-bold text-white">
          {number}
        </div>
        <div className="flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5 shadow-sm transition-colors duration-200">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-semibold text-gray-900">
        <span>{question}</span>
        <ChevronDown className="h-5 w-5 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="mt-4 pr-8 leading-7 text-gray-600">{answer}</p>
    </details>
  );
}
