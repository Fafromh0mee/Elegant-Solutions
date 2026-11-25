import type { ReactNode } from "react";
import Image from "next/image";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  Cpu,
  Database,
  FileCheck2,
  Fingerprint,
  Globe2,
  KeyRound,
  LockKeyhole,
  Monitor,
  Network,
  ScanFace,
  Search,
  Server,
  Shield,
  ShieldCheck,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { adminLinks } from "@/lib/admin-nav";
import { BrandMark } from "./brand-mark";
import type { DeckSlide } from "./slide-deck";

const chapters = ["WHY", "WHO", "WHAT", "HOW", "PROOF"] as const;
type Chapter = (typeof chapters)[number];
const chapterLabels: Record<Chapter, string> = {
  WHY: "ที่มา",
  WHO: "ผู้ใช้",
  WHAT: "ระบบ",
  HOW: "วิธีทำงาน",
  PROOF: "หลักฐาน",
};

function Frame({
  chapter,
  number,
  title,
  subtitle,
  children,
}: {
  chapter: Chapter;
  number: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="final-slide">
      <div className="final-top">
        <span className="final-brand">
          <BrandMark size={29} /> Elegant Solution
        </span>
        <div className="final-chapters">
          {chapters.map((item) => (
            <span key={item} className={item === chapter ? "active" : ""}>
              {chapterLabels[item]}
            </span>
          ))}
        </div>
      </div>
      <header className="final-heading">
        <span>
          {String(number).padStart(2, "0")} / 15 · {chapterLabels[chapter]}
        </span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <main className="final-main">{children}</main>
      <footer className="final-footer">
        <span>โครงงานจบ · การนำเสนอผลงาน</span>
        <span>Elegant Solution · Agent 0.5.0</span>
      </footer>
    </div>
  );
}

function IconLabel({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
}) {
  return (
    <div className="final-label">
      <span className="final-label-icon">
        <Icon size={25} strokeWidth={1.7} />
      </span>
      <div>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}
function Step({
  n,
  title,
  detail,
}: {
  n: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="final-step">
      <span>{n}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}
function Screenshot({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <Image
      className={`final-screenshot ${className}`}
      src={src}
      alt={alt}
      width={1600}
      height={900}
    />
  );
}

function Cover() {
  return (
    <div className="final-cover">
      <div className="final-cover-top">
        <span className="final-cover-brand">
          <BrandMark size={48} /> Elegant Solution
        </span>
        <span>Final Project Presentation · 2026</span>
      </div>
      <div className="final-cover-body">
        <div className="final-cover-copy">
          <small>Smart Lab Management System</small>
          <h1>
            Elegant
            <br />
            <em>Solution</em>
          </h1>
          <p>
            ระบบบริหารจัดการห้องปฏิบัติการอัจฉริยะ
            <br />
            จัดการห้อง สิทธิ์เข้าใช้ และสถานะคอมพิวเตอร์
          </p>
        </div>
        <div className="final-cover-visual">
          <span>ระบบเดียวสำหรับการใช้ห้อง</span>
          <div className="final-cover-grid">
            <IconLabel
              icon={CalendarDays}
              title="Class Schedule"
              detail="นำเข้าตารางเรียน"
            />
            <IconLabel
              icon={Search}
              title="Room Finder"
              detail="ค้นหาและจองห้อง"
            />
            <IconLabel
              icon={ShieldCheck}
              title="Gate Access"
              detail="ตรวจสิทธิ์ตามเวลา"
            />
            <IconLabel
              icon={Monitor}
              title="Tracking Agent"
              detail="สถานะเครื่อง LAB"
            />
          </div>
          <div className="final-cover-result">
            <Check size={26} />
            <strong>ตรวจสิทธิ์ตามคน ห้อง และเวลา</strong>
          </div>
        </div>
      </div>
      <div className="final-cover-bottom">
        <span>คณะผู้จัดทำโครงงาน · อาจารย์ที่ปรึกษา</span>
        <span>Agent Version 0.5.0</span>
      </div>
    </div>
  );
}

function Background() {
  const problems = [
    [
      CalendarDays,
      "ข้อมูลกระจาย",
      "ตารางเรียน ห้องว่าง และการจองอยู่คนละขั้นตอน",
    ],
    [
      LockKeyhole,
      "สิทธิ์ไม่ใช่แค่การ login",
      "ต้องรู้ว่าใครใช้ห้องไหน และเวลาใด",
    ],
    [
      Monitor,
      "สถานะเครื่องไม่ต่อเนื่อง",
      "ผู้ดูแลต้องเห็นเครื่อง Online และกิจกรรมตาม session",
    ],
  ] as const;
  return (
    <Frame
      chapter="WHY"
      number={2}
      title="โจทย์ของการบริหารห้องปฏิบัติการ"
      subtitle="การตัดสินว่าใครใช้ห้องได้ ต้องอ้างอิงข้อมูลชุดเดียวกัน"
    >
      <div className="final-problem-grid">
        {problems.map(([Icon, title, detail]) => (
          <div key={title} className="final-problem">
            <span className="final-problem-icon">
              <Icon size={31} />
            </span>
            <h2>{title}</h2>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <div className="final-problem-join">
        <span>ข้อมูลที่ต้องเชื่อมกัน</span>
        <div>
          <CalendarDays size={22} />
          <ArrowRight size={22} />
          <ShieldCheck size={22} />
          <ArrowRight size={22} />
          <Activity size={22} />
        </div>
        <strong>สิทธิ์เข้าใช้ที่ตรวจสอบย้อนหลังได้</strong>
      </div>
      <p className="final-footnote">
        ขอบเขตนี้อ้างอิงโค้ดและรายงานโครงงาน ไม่ใช่ผลสำรวจเชิงสถิติจากหน้างาน
      </p>
    </Frame>
  );
}

function Objectives() {
  const goals = [
    [
      "01",
      "จัดการผู้ใช้ ห้อง และตารางเรียน",
      "ข้อมูลกลางสำหรับผู้ใช้และผู้ดูแล",
    ],
    [
      "02",
      "ค้นหาและจองตามความว่าง",
      "รองรับ Schedule-Based และ Request-Based Access",
    ],
    ["03", "ตัดสินสิทธิ์ก่อนการเข้าใช้", "ตรวจ user × room × current time"],
    [
      "04",
      "ยืนยันตัวตนที่ Gate",
      "QR / Token และ Face Recognition ตามช่องทางที่เปิดใช้",
    ],
    ["05", "ติดตามสถานะเครื่อง LAB", "Heartbeat แยกจากกิจกรรมใน Agent session"],
  ];
  return (
    <Frame
      chapter="WHY"
      number={3}
      title="วัตถุประสงค์และขอบเขต"
      subtitle="ระบบต้องเชื่อมการจัดการห้องกับการตรวจสิทธิ์และสถานะเครื่อง"
    >
      <div className="final-objectives">
        {goals.map(([n, title, detail]) => (
          <div key={n}>
            <span>{n}</span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <div className="final-scope-row">
        <div>
          <strong>อยู่ในขอบเขต</strong>
          <span>
            Web Application · Face AI · Tracking Agent · Admin Monitoring
          </span>
        </div>
        <div>
          <strong>ต้องพัฒนาต่อ</strong>
          <span>
            การเชื่อมต่อกลอนประตูจริง และการติดตั้งผ่านทุก OS ในเครื่องจริง
          </span>
        </div>
      </div>
    </Frame>
  );
}

function Overview() {
  const parts = [
    [Globe2, "Web Application", "Student · Guest · Admin · Super Admin"],
    [
      Shield,
      "Authentication & Access Control",
      "OAuth · Email/Password · Role · Entitlement",
    ],
    [ScanFace, "AI Face Recognition", "InsightFace · Embedding · Similarity"],
    [Cpu, "Tracking Agent", "Machine Service · User Session UI · Heartbeat"],
  ] as const;
  return (
    <Frame
      chapter="WHAT"
      number={4}
      title="องค์ประกอบหลักของระบบ"
      subtitle="สี่ส่วนทำงานร่วมกันผ่าน backend และข้อมูลกลาง"
    >
      <div className="final-overview-grid">
        {parts.map(([Icon, title, detail], index) => (
          <div key={title} className={index === 0 ? "featured" : ""}>
            <span className="final-overview-icon">
              <Icon size={30} />
            </span>
            <b>0{index + 1}</b>
            <h2>{title}</h2>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <div className="final-overview-line">
        <span>Web</span>
        <ArrowRight size={23} />
        <span>Backend APIs</span>
        <ArrowRight size={23} />
        <span>PostgreSQL / Face AI / Agent</span>
      </div>
    </Frame>
  );
}

function Roles() {
  const roles = [
    [ShieldCheck, "SUPER ADMIN", "กำหนดค่าระบบและ Batch Enrollment"],
    [Shield, "ADMIN", "จัดการผู้ใช้ ห้อง ตาราง การจอง และ Monitoring"],
    [Users, "STUDENT", "นำเข้าตาราง ค้นหา จอง และใช้สิทธิ์ตามเวลา"],
    [KeyRound, "GUEST", "ใช้เฉพาะห้องที่เปิดให้ Guest และบัญชีอนุมัติแล้ว"],
  ] as const;
  return (
    <Frame
      chapter="WHO"
      number={5}
      title="ผู้ใช้งาน 4 ประเภท"
      subtitle="Role ควบคุมการมองเห็นและการกระทำ แต่การใช้ห้องยังต้องผ่าน entitlement"
    >
      <div className="final-roles">
        {roles.map(([Icon, code, detail]) => (
          <div key={code}>
            <span className="final-role-icon">
              <Icon size={30} />
            </span>
            <span className="final-role-code">{code}</span>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <div className="final-role-note">
        <LockKeyhole size={22} />
        <span>การอนุมัติบัญชีและการตรวจสิทธิ์เกิดที่ backend ทุกจุดสำคัญ</span>
      </div>
    </Frame>
  );
}

function Architecture() {
  return (
    <Frame
      chapter="WHAT"
      number={6}
      title="สถาปัตยกรรมและ Technology Stack"
      subtitle="Web, Face AI และ Agent เชื่อมกับ backend ผ่าน API; PostgreSQL เป็นข้อมูลกลาง"
    >
      <div className="final-architecture">
        <div className="final-architecture-column">
          <span>CLIENTS</span>
          <IconLabel
            icon={Globe2}
            title="Browser"
            detail="Next.js · React · TailwindCSS"
          />
          <IconLabel
            icon={Cpu}
            title="Tracking Agent"
            detail="Python · Windows / macOS / Ubuntu"
          />
        </div>
        <div className="final-architecture-connector">
          <ArrowRight size={30} />
        </div>
        <div className="final-architecture-column featured">
          <span>APPLICATION BACKEND</span>
          <IconLabel
            icon={Server}
            title="Next.js APIs"
            detail="Auth.js / NextAuth · TypeScript"
          />
          <IconLabel
            icon={Fingerprint}
            title="FastAPI Face AI"
            detail="InsightFace · Python"
          />
        </div>
        <div className="final-architecture-connector">
          <ArrowRight size={30} />
        </div>
        <div className="final-architecture-column">
          <span>DATA & DEPLOYMENT</span>
          <IconLabel icon={Database} title="PostgreSQL" detail="Prisma ORM 7" />
          <IconLabel
            icon={Network}
            title="Docker Compose / Nginx"
            detail="บริการและ reverse proxy"
          />
        </div>
      </div>
      <p className="final-footnote">
        เวอร์ชันที่นำเสนอ: Smart Lab Management System · Elegant Solution ·
        Agent 0.5.0
      </p>
    </Frame>
  );
}

function RoomManagement() {
  return (
    <Frame
      chapter="HOW"
      number={7}
      title="Room Management และ Booking"
      subtitle="เริ่มจากข้อมูลตารางเรียน แล้วค้นหาและจองห้องตามเงื่อนไขจริง"
    >
      <div className="final-product-split">
        <div className="final-process-list">
          <Step
            n="01"
            title="นำเข้าตารางจาก BU Mobile"
            detail="OCR อ่านภาพ แล้วตรวจสอบและแก้ไขก่อนบันทึก"
          />
          <Step
            n="02"
            title="Room Finder"
            detail="ค้นหาจากช่วงเวลา ความจุ และคุณสมบัติห้อง"
          />
          <Step
            n="03"
            title="Room Booking"
            detail="เลือก slot และผู้ร่วมจองตาม policy ของห้อง"
          />
          <Step
            n="04"
            title="Access Decision"
            detail="CLASS หรือ APPROVED BOOKING กลายเป็นสิทธิ์รายเวลา"
          />
        </div>
        <div className="final-shot-wrap">
          <Screenshot
            src="/presentation-assets/ui-rooms-crop.png"
            alt="ภาพหน้าจอค้นหาและจัดการห้องจากระบบจริง"
          />
          <span>ภาพจาก Project Files · UI จริงของระบบ</span>
        </div>
      </div>
    </Frame>
  );
}

function AccessControl() {
  return (
    <Frame
      chapter="HOW"
      number={8}
      title="Authentication และ Gate Access"
      subtitle="ยืนยันบัญชีและตรวจช่องทางเข้าใช้ที่ระบบรองรับ"
    >
      <div className="final-access-layout">
        <div className="final-access-copy">
          <div className="final-access-block">
            <Globe2 size={25} />
            <div>
              <strong>Google OAuth 2.0</strong>
              <p>
                นักศึกษาใช้บัญชี <code>@bumail.net</code>; Admin / Super Admin
                ใช้บัญชีเดิมที่มี role ในฐานข้อมูล
              </p>
            </div>
          </div>
          <div className="final-access-block">
            <KeyRound size={25} />
            <div>
              <strong>Email / Password</strong>
              <p>ตรวจบัญชีและ hashed password ที่จัดเก็บในฐานข้อมูล</p>
            </div>
          </div>
          <div className="final-access-block">
            <LockKeyhole size={25} />
            <div>
              <strong>Role + Room Entitlement</strong>
              <p>Gate ตรวจสิทธิ์ซ้ำตาม user, room และ current time</p>
            </div>
          </div>
          <div className="final-mode-strip">
            <span>Gate Kiosk มี 3 โหมด</span>
            <b>Camera QR Scan</b>
            <b>Manual Token Input</b>
            <b>Face Recognition</b>
          </div>
        </div>
        <div className="final-shot-wrap final-gate-shot">
          <Screenshot
            src="/presentation-assets/ui-gate-crop.png"
            alt="ภาพหน้าจอ Gate Kiosk จากระบบจริง"
          />
          <span>Face Matching ไม่รวม Guest Face Profiles</span>
        </div>
      </div>
    </Frame>
  );
}

function FaceRecognition() {
  const steps = [
    [Monitor, "Capture", "กล้องหน้า Gate จับภาพทุก 600 ms"],
    [ScanFace, "Detect", "InsightFace ตรวจหาใบหน้าและคุณภาพภาพ"],
    [
      Fingerprint,
      "Embed + Match",
      "สร้าง facial embedding แล้วเทียบด้วย cosine similarity",
    ],
    [ShieldCheck, "Decide", "ผ่านเมื่อ score ≥ 0.73 แล้วตรวจ entitlement"],
  ] as const;
  return (
    <Frame
      chapter="HOW"
      number={9}
      title="AI Face Recognition"
      subtitle="ยืนยันตัวตนก่อนตัดสินใจ Check-in หรือ Check-out"
    >
      <div className="final-face-flow">
        {steps.map(([Icon, title, detail], index) => (
          <div key={title} className="final-face-step">
            <span className="final-face-icon">
              <Icon size={30} />
            </span>
            <b>0{index + 1}</b>
            <h2>{title}</h2>
            <p>{detail}</p>
            {index < steps.length - 1 && (
              <ArrowRight className="final-face-arrow" size={25} />
            )}
          </div>
        ))}
      </div>
      <div className="final-face-result">
        <strong>matched</strong>
        <span>→</span>
        <strong>user</strong>
        <span>→</span>
        <strong>Room Entitlement</strong>
        <span>→</span>
        <strong>check-in / check-out</strong>
      </div>
      <p className="final-callout">Face Profiles ปัจจุบันไม่รวม Guest</p>
    </Frame>
  );
}

function TrackingAgent() {
  return (
    <Frame
      chapter="HOW"
      number={10}
      title="Tracking Agent แยกเครื่องออกจากผู้ใช้"
      subtitle="Agent Version 0.5.0 แบ่งหน้าที่เป็น Machine Service และ User Session UI"
    >
      <div className="final-agent">
        <div>
          <span>MACHINE SERVICE</span>
          <Cpu size={45} strokeWidth={1.5} />
          <h2>สถานะเครื่อง</h2>
          <p>
            เริ่มตามระบบปฏิบัติการ เก็บ machine identity และส่ง heartbeat ทุก 10
            วินาที
          </p>
          <strong>
            <i /> ส่งต่อ Backend แม้ไม่มีผู้ใช้ login
          </strong>
        </div>
        <div className="final-agent-divider">แยกหน้าที่</div>
        <div>
          <span>USER SESSION UI</span>
          <Monitor size={45} strokeWidth={1.5} />
          <h2>กิจกรรมผู้ใช้</h2>
          <p>
            Login ด้วยบัญชีที่มีสิทธิ์ห้อง แล้วอ่าน Active Window / Application
            Activity
          </p>
          <strong>ส่งเฉพาะช่วงที่มี Agent session</strong>
        </div>
      </div>
      <div className="final-agent-timeline">
        <span>ไม่มีผู้ใช้</span>
        <ArrowRight size={21} />
        <span>Machine heartbeat ต่อ</span>
        <ArrowRight size={21} />
        <span>Logout</span>
        <ArrowRight size={21} />
        <span>Activity หยุด</span>
      </div>
      <p className="final-callout">
        macOS ต้องอนุญาต Automation / Accessibility; Wayland
        อาจไม่มีชื่อหน้าต่างทั่วไป
      </p>
    </Frame>
  );
}

function AdminDashboard() {
  return (
    <Frame
      chapter="WHAT"
      number={11}
      title="Admin Dashboard และ Monitoring"
      subtitle="ผู้ดูแลเห็นข้อมูลการบริหารห้องและสถานะเครื่องจากระบบเดียว"
    >
      <div className="final-admin-layout">
        <div className="final-admin-copy">
          <div className="final-admin-count">
            <strong>{adminLinks.length}</strong>
            <span>เมนูใน Admin Panel</span>
          </div>
          <p>
            จัดการผู้ใช้ ห้อง ตารางเรียน คำขอจอง การจอง Tracking Agent Activity
            Log Reports และ System Health
          </p>
          <div className="final-admin-list">
            <span>
              <Check size={17} /> User / Room / Booking
            </span>
            <span>
              <Check size={17} /> Tracking Agent Monitoring
            </span>
            <span>
              <Check size={17} /> Reports / Logs / Alerts
            </span>
          </div>
        </div>
        <div className="final-admin-shots">
          <div>
            <Screenshot
              src="/presentation-assets/ui-admin-crop.png"
              alt="ภาพ Admin Dashboard จากระบบจริง"
            />
            <span>Dashboard</span>
          </div>
          <div>
            <Screenshot
              src="/presentation-assets/ui-tracking-crop.png"
              alt="ภาพ Tracking Monitoring จากระบบจริง"
            />
            <span>Tracking</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function TestingResults() {
  const rows = [
    [
      "Web Unit Tests",
      "549 เคส · 25 ไฟล์",
      "ผ่านทั้งหมดตามรายงานบันทึกวันที่ 20 พ.ย. 2569 และรันซ้ำผ่านในรอบตรวจนี้",
      "ผ่าน",
      Check,
    ],
    [
      "Agent Tests",
      "19 เคส · 6 ไฟล์",
      "รันด้วย Agent build environment แล้วผ่านทั้งหมด",
      "ผ่าน",
      Check,
    ],
    [
      "Database Tests",
      "166 เคส · 11 ไฟล์",
      "ฐานข้อมูลทดสอบยังไม่พร้อม จึงเกิด Prisma error และ 166 เคสถูก skip",
      "รันไม่ผ่าน",
      XCircle,
    ],
    [
      "Build / Deployment",
      "EXE · PKG × 2 · DEB",
      "มีไฟล์ build และคู่มือราย OS แต่ build ไม่เท่ากับติดตั้งผ่านทุกระบบ",
      "หลักฐานไฟล์",
      FileCheck2,
    ],
    [
      "Real Device Pilot",
      "macOS Online",
      "มีบันทึกว่าเครื่อง Online; login, activity, logout, reboot และ Windows/Ubuntu ยังต้องตรวจเพิ่ม",
      "บางส่วน",
      Monitor,
    ],
  ] as const;
  return (
    <Frame
      chapter="PROOF"
      number={12}
      title="System Testing และหลักฐานความสำเร็จ"
      subtitle="แยก Unit Tests, Build/Deployment และ Real Device Pilot ออกจากกัน"
    >
      <div className="final-test-table">
        {rows.map(([name, metric, detail, status, Icon]) => (
          <div key={name} className="final-test-row">
            <div className="final-test-name">
              <Icon size={21} />
              <strong>{name}</strong>
            </div>
            <b>{metric}</b>
            <p>{detail}</p>
            <span className={status === "ผ่าน" ? "passed" : "review"}>
              {status}
            </span>
          </div>
        ))}
      </div>
      <p className="final-footnote">
        549 เป็น Web Unit Tests ไม่ใช่ End-to-End Test
        และไม่มีการรวมตัวเลขต่างประเภทเป็นคะแนนเดียว
      </p>
    </Frame>
  );
}

function Limitations() {
  return (
    <Frame
      chapter="PROOF"
      number={13}
      title="ข้อจำกัดและแนวทางพัฒนาต่อ"
      subtitle="แยกสิ่งที่ระบบทำได้แล้วออกจากสิ่งที่ต้องพิสูจน์ก่อนใช้งานจริง"
    >
      <div className="final-two-column">
        <div className="final-limit-column">
          <span>ข้อจำกัดปัจจุบัน</span>
          <p>
            <XCircle size={20} /> Face Recognition ยังไม่มี liveness detection
          </p>
          <p>
            <XCircle size={20} /> ต้องกำหนดนโยบายข้อมูลชีวมิติและการเก็บ log
          </p>
          <p>
            <XCircle size={20} /> Windows / Ubuntu ยังต้องทดสอบติดตั้งและ
            recovery บนเครื่องจริง
          </p>
          <p>
            <XCircle size={20} /> ยังไม่เชื่อมต่อกลอนประตูอิเล็กทรอนิกส์จริง
          </p>
        </div>
        <div className="final-limit-column future">
          <span>แนวทางพัฒนาต่อ</span>
          <p>
            <Check size={20} /> เพิ่ม liveness และ privacy controls สำหรับ Face
            AI
          </p>
          <p>
            <Check size={20} /> ทำ OS test matrix: activate, login, activity,
            logout, reboot
          </p>
          <p>
            <Check size={20} /> เพิ่มหลักฐาน observability และ recovery ใน Admin
          </p>
          <p>
            <Check size={20} /> ออกแบบ hardware integration แยกจาก Gate software
          </p>
        </div>
      </div>
    </Frame>
  );
}

function Conclusion() {
  return (
    <Frame
      chapter="PROOF"
      number={14}
      title="สรุปผลโครงงาน"
      subtitle="Elegant Solution เชื่อมการบริหารห้องกับการตรวจสิทธิ์และการติดตามเครื่อง"
    >
      <div className="final-conclusion">
        <div>
          <span>สิ่งที่พัฒนาได้</span>
          <Step
            n="01"
            title="ข้อมูลห้องและการจอง"
            detail="OCR · Room Finder · Booking · Entitlement"
          />
          <Step
            n="02"
            title="การยืนยันและควบคุมสิทธิ์"
            detail="OAuth · Email/Password · QR/Token · Face AI"
          />
          <Step
            n="03"
            title="การติดตามเครื่อง"
            detail="Machine heartbeat แยกจาก User session activity"
          />
        </div>
        <div>
          <BrandMark size={62} />
          <p>
            ใครใช้ห้องไหน
            <br />
            ได้ในเวลาใด
          </p>
          <strong>อธิบายได้จากข้อมูลชุดเดียวกัน</strong>
          <small>ต่อไปคือการสาธิตระบบจริงตาม flow ที่มีหลักฐานพร้อม</small>
        </div>
      </div>
    </Frame>
  );
}

function LiveDemo() {
  const demos = [
    "User Authentication & Room Booking",
    "Gate Access Verification",
    "AI Face Recognition",
    "Tracking Agent",
    "Admin Dashboard",
  ];
  return (
    <div className="final-live-demo">
      <div className="final-live-top">
        <span className="final-cover-brand">
          <BrandMark size={39} /> Elegant Solution
        </span>
        <span>Smart Lab Management System · Agent 0.5.0</span>
      </div>
      <div className="final-live-body">
        <span className="final-live-kicker">NEXT</span>
        <h1>
          LIVE SYSTEM
          <br />
          <em>DEMONSTRATION</em>
        </h1>
        <p>ต่อไปเป็นการสาธิตการทำงานของระบบจริง</p>
      </div>
      <div className="final-demo-list">
        {demos.map((item, index) => (
          <div key={item}>
            <span>0{index + 1}</span>
            <strong>{item}</strong>
          </div>
        ))}
      </div>
      <div className="final-live-footer">
        <span>พร้อมเปิดระบบจริง</span>
        <span>15 / 15</span>
      </div>
    </div>
  );
}

export const DECK_SLIDES: DeckSlide[] = [
  {
    id: "cover",
    content: <Cover />,
    notes:
      "เปิดด้วยชื่อผลิตภัณฑ์ Elegant Solution และชื่อระบบ Smart Lab Management System เวอร์ชัน Agent 0.5.0 จากนั้นบอกโครงเรื่องสั้น ๆ ว่าจะเล่าจาก WHY ไป WHO, WHAT, HOW, PROOF แล้วต่อด้วยการสาธิตจริง รายชื่อสมาชิกและอาจารย์ที่ปรึกษายังไม่ได้ระบุเป็นข้อมูลจริงใน Project Files จึงแสดงเฉพาะบทบาท ไม่เติมชื่อขึ้นมาเอง",
  },
  {
    id: "background",
    content: <Background />,
    notes:
      "ปัญหาหลักของงานนี้คือการตัดสินสิทธิ์เข้าใช้ห้องต้องอาศัยข้อมูลหลายส่วน ไม่ใช่แค่ตรวจว่าผู้ใช้ login แล้วหรือห้องว่างอยู่ สไลด์นี้อธิบายโจทย์จากรายงานและ source code โดยไม่อ้างตัวเลขผลสำรวจ",
  },
  {
    id: "objectives",
    content: <Objectives />,
    notes:
      "วัตถุประสงค์ครอบคลุมการจัดการข้อมูลห้อง การค้นหาและจอง การตรวจสิทธิ์ Gate และการเห็นสถานะเครื่อง จุดสำคัญคือขอบเขตปัจจุบันเป็นซอฟต์แวร์ Gate/Kiosk และ Agent ยังไม่มีหลักฐานการเชื่อมกลอนประตูจริงหรือการติดตั้งผ่านทุก OS บนเครื่องจริง",
  },
  {
    id: "overview",
    content: <Overview />,
    notes:
      "อธิบาย 4 องค์ประกอบหลัก ได้แก่ Web Application, Authentication & Access Control, AI Face Recognition และ Tracking Agent แล้วชี้ว่าทั้งหมดเชื่อมผ่าน backend APIs และข้อมูลกลาง PostgreSQL",
  },
  {
    id: "roles",
    content: <Roles />,
    notes:
      "ระบบมี 4 role ตาม source code และรายงาน: Student, Guest, Admin และ Super Admin Guest ต้องได้รับอนุมัติและใช้ได้เฉพาะห้องที่เปิดให้ Guest ส่วนการตรวจสิทธิ์สำคัญยังเกิดที่ backend ไม่ใช่แค่การซ่อนเมนูบนหน้าเว็บ",
  },
  {
    id: "architecture",
    content: <Architecture />,
    notes:
      "Technology stack ที่ใช้จริงจาก package/config/report ได้แก่ Next.js 16, React 19, TypeScript, TailwindCSS, Auth.js/NextAuth, Prisma 7, PostgreSQL, FastAPI, InsightFace, Python, Docker Compose และ Nginx ส่วน Agent ใช้ Python core เดียวกันบน Windows, macOS และ Ubuntu",
  },
  {
    id: "rooms",
    content: <RoomManagement />,
    notes:
      "เล่า flow ของนักศึกษา: นำเข้าตารางจากภาพ BU Mobile ด้วย OCR, ตรวจ preview และแก้ข้อมูลก่อนบันทึก, ใช้ Room Finder, สร้าง booking ตาม slot และ policy ห้อง จากนั้น entitlement engine จึงนำ CLASS หรือ APPROVED BOOKING ไปใช้ตัดสินสิทธิ์ ภาพเป็น screenshot จาก Project Files",
  },
  {
    id: "access",
    content: <AccessControl />,
    notes:
      "Google OAuth 2.0 จำกัดนักศึกษาที่ @bumail.net และอนุญาตบัญชี Admin/Super Admin เดิมที่ role อยู่ในฐานข้อมูล ส่วน Email/Password ใช้บัญชีที่มี hashed password ในฐานข้อมูล ระบบไม่มี Google Authenticator หรือ TOTP ใน flow ปัจจุบัน Gate Kiosk มี Camera QR Scan, Manual Token Input และ Face Recognition โดย Face Matching ไม่รวม Guest Face Profiles",
  },
  {
    id: "face",
    content: <FaceRecognition />,
    notes:
      "Face flow คือ capture ภาพทุก 600 ms, ส่งไป Face AI, ใช้ InsightFace ตรวจหาใบหน้าและสร้าง embedding, เปรียบเทียบด้วย cosine similarity โดยค่าเริ่มต้น FACE_THRESHOLD = 0.73 จากนั้นระบบตรวจ room entitlement ก่อน check-in หรือ check-out Guest ไม่อยู่ใน Face Profiles ปัจจุบัน และ liveness detection ยังเป็นข้อจำกัด",
  },
  {
    id: "agent",
    content: <TrackingAgent />,
    notes:
      "ย้ำการแยกสองส่วน: Machine Service ส่ง heartbeat ทุก 10 วินาทีต่อไปหลัง activation แม้ไม่มี user login ขณะที่ User Session UI ส่ง Active Window/Application Activity เฉพาะตอนมี Agent session ที่ login และผ่าน entitlement แล้ว เมื่อ logout activity หยุด แต่ heartbeat ของเครื่องยังทำงานและ Admin ยังเห็นสถานะเครื่อง",
  },
  {
    id: "admin",
    content: <AdminDashboard />,
    notes:
      "ภาพจริงจาก Project Files แสดงหน้า Admin Dashboard และ Tracking Monitoring อธิบายว่าผู้ดูแลจัดการผู้ใช้ ห้อง ตาราง การจอง ดู Agent status, logs, reports และ system health ได้ โดยไม่อ้างตัวเลขจากภาพสาธิตเป็น production metrics",
  },
  {
    id: "testing",
    content: <TestingResults />,
    notes:
      "แยกหลักฐานตามชนิด: Web Unit Tests 549 เคสจาก 25 ไฟล์ผ่าน และรันซ้ำผ่านในรอบตรวจนี้ ซึ่งไม่ใช่ End-to-End Test; Agent tests 19 เคสจาก 6 ไฟล์ผ่านด้วย build environment; Database tests พบ Prisma error ในฐานข้อมูลทดสอบ ทำให้ 166 เคสจาก 11 ไฟล์ถูก skip จึงยังไม่ถือว่าผ่าน Build/Deployment แปลว่ามี artifact/คู่มือ ไม่ได้แปลว่าติดตั้งและทดสอบผ่านทุก OS แล้ว Real Device Pilot มีหลักฐาน macOS Online แบบบางส่วน",
  },
  {
    id: "limits",
    content: <Limitations />,
    notes:
      "ข้อจำกัดที่พูดได้ตรงกับรายงานและคู่มือคือยังไม่มี liveness, ต้องกำหนด privacy policy, ต้องทดสอบ Windows/Ubuntu บนเครื่องจริงครบ flow และยังไม่มีกลอนประตูจริง แนวทางต่อยอดจึงแบ่งเป็น Face/privacy, OS test matrix, observability/recovery และ hardware integration",
  },
  {
    id: "conclusion",
    content: <Conclusion />,
    notes:
      "สรุปว่าโครงงานพัฒนาการจัดการห้อง การจอง การตรวจสิทธิ์ และ Tracking Agent ได้เป็นระบบเดียว จุดเด่นคือ entitlement ใช้ user, room และเวลาเดียวกัน และ Agent แยกสถานะเครื่องออกจากกิจกรรมผู้ใช้ จบสไลด์นี้ด้วยการบอกว่าจะเริ่ม Live System Demonstration ต่อทันที",
  },
  {
    id: "live-demo",
    content: <LiveDemo />,
    notes:
      "ไม่ต้องกล่าว Thank You ในสไลด์นี้ ให้เปลี่ยนจากการนำเสนอเป็นการเปิดระบบจริงตามลำดับที่พร้อม: Authentication และ Room Booking, Gate Access, Face Recognition, Tracking Agent และ Admin Dashboard หาก flow ใดไม่มีหลักฐานพร้อม ให้บอกสถานะจริงและใช้ fallback จาก DEMO_SCRIPT.md โดยไม่สร้าง telemetry ขึ้นมา",
  },
];
