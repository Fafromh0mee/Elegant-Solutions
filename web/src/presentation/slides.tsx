import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  FileImage,
  Flag,
  KeyRound,
  Layers,
  Loader2,
  Milestone,
  ScanFace,
  Search,
  ShieldCheck,
  Smartphone,
  TableProperties,
  TriangleAlert,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { BookingStatusBadge } from "@/app/admin/bookings/status-badge";
import { MyBookingsSection } from "@/components/my-bookings-section";
import { RoomFinderResults } from "@/components/room-finder/room-finder-results";
import { getSlotLabel } from "@/lib/academic-slots";
import { formatAcademicDate } from "@/lib/ui-terms";
import { BrandMark } from "./brand-mark";
import {
  DEMO_DATE,
  demoFinderSearch,
  demoMyBookings,
  demoOcr,
  demoParticipants,
  demoStudentId,
} from "./demo-data";
import type { DeckSlide } from "./slide-deck";

// The four progress-update slides. Styling uses only the product's own tokens and
// component classes (globals.css: --color-*, .card, .badge, .btn-*); product
// components are rendered non-interactive with static demo state.

const DAY_TH = [
  "อาทิตย์",
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
];

// Badge colours as used in the product: green = approved/ready, amber = waiting,
// blue-50/700 = informational, primary-light/cta = .badge-admin.
const STATUS = {
  done: "badge bg-green-100 text-green-800",
  qa: "badge bg-blue-50 text-blue-700",
  next: "badge bg-amber-100 text-amber-800",
};

/** Live product UI shown as a visual: never clickable or focusable on a slide. */
function ProductVisual({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div inert className={`pointer-events-none select-none ${className}`}>
      {children}
    </div>
  );
}

function SlideHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Layers;
  title: string;
}) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Icon className="h-8 w-8 text-gray-700" />
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      </div>
      <div className="flex items-center gap-1 text-sm text-(--color-text-muted)">
        <BrandMark size={28} />
        Progress Update
      </div>
    </header>
  );
}

function SampleCaption({
  children = "คอมโพเนนต์จากระบบจริง · ข้อมูลตัวอย่าง",
}: {
  children?: ReactNode;
}) {
  return <p className="text-xs text-(--color-text-muted)">{children}</p>;
}

// --- Slide 1: Opening -------------------------------------------------------------

function ScheduleCard() {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-1">
        <h2 className="text-lg font-semibold">ตารางเรียนของฉัน</h2>
        <p className="text-xs text-gray-500">รหัสนักศึกษา: {demoStudentId}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="pr-3 pb-2">วัน</th>
            <th className="pr-3 pb-2">เวลา</th>
            <th className="pr-3 pb-2">วิชา</th>
            <th className="pr-3 pb-2">Section</th>
            <th className="pb-2">ห้อง</th>
          </tr>
        </thead>
        <tbody>
          {demoOcr.rows.map((row) => (
            <tr
              key={`${row.courseCode}-${row.section}`}
              className="border-b last:border-0"
            >
              <td className="py-2 pr-3">
                {row.dayOfWeek !== null ? DAY_TH[row.dayOfWeek] : row.dayLabel}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {row.startTime} - {row.endTime}
              </td>
              <td className="max-w-44 truncate py-2 pr-3">
                {row.courseCode} | {row.courseName}
              </td>
              <td className="py-2 pr-3">{row.section}</td>
              <td className="py-2">{row.room}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpeningSlide() {
  return (
    <div className="grid h-full grid-cols-[1fr_640px] items-center gap-12 px-16">
      <div>
        <BrandMark size={72} />
        <h1 className="mt-6 text-6xl font-bold tracking-tight text-gray-900">
          Elegant Solution
        </h1>
        <p className="mt-3 text-3xl font-semibold text-(--color-primary)">
          Progress Update
        </p>
        <p className="mt-8 inline-flex items-center gap-2 text-lg text-gray-700">
          <Flag className="h-5 w-5 text-(--color-primary)" />
          Preparing for on-site pilot
        </p>
        {/* <p className="mt-3 text-sm text-(--color-text-muted)">Schedule · Room Booking · Access · Computer Usage</p> */}
      </div>

      <ProductVisual className="flex flex-col gap-4">
        <ScheduleCard />
        <div className="grid grid-cols-2 items-start gap-4">
          <div className="deck-cols-1">
            <RoomFinderResults search={demoFinderSearch} />
          </div>
          <div className="deck-cols-1 deck-flush">
            <MyBookingsSection bookings={demoMyBookings} />
          </div>
        </div>
      </ProductVisual>
    </div>
  );
}

// --- Slide 2: Development progress ---------------------------------------------------

const MILESTONES: Array<{
  title: string;
  detail: string;
  status: keyof typeof STATUS;
  label: string;
  highlight?: boolean;
  note?: string;
}> = [
  {
    title: "Room Finder + Solo / Group Booking",
    detail: "ค้นหาห้อง · จองเดี่ยว / กลุ่ม",
    status: "done",
    label: "ใช้งานได้",
  },
  {
    title: "BU Mobile OCR → ClassSchedule",
    detail: "นำเข้าตารางเรียนจาก screenshot",
    status: "done",
    label: "ทดสอบกับภาพจริงแล้ว",
    highlight: true,
  },
  {
    title: "Admin Approval",
    detail: "Implementation + automated tests",
    status: "done",
    label: "เสร็จแล้ว",
  },
  {
    title: "Admin Approval",
    detail: "Browser QA",
    status: "qa",
    label: "กำลังทดสอบ",
  },
  {
    title: "Room Entitlement → Face Verification",
    detail: "Logic กลางสำหรับสิทธิ์เข้าห้อง",
    status: "done",
    label: "Logic + tests",
    note: "รอ validate กับอุปกรณ์จริง",
  },
  {
    title: "Tracking Agent",
    detail: "Prototype มีแล้ว",
    status: "next",
    label: "Next integration",
  },
];

const STATUS_DOT = {
  done: "bg-(--color-success) text-white",
  qa: "bg-(--color-secondary) text-white",
  next: "bg-(--color-warning) text-white",
};

function StatusIcon({ status }: { status: keyof typeof STATUS }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "qa") return <Loader2 className="h-4 w-4" />;
  return <Clock className="h-4 w-4" />;
}

function ProgressSlide() {
  return (
    <div className="flex h-full flex-col px-14 py-10">
      <SlideHeader icon={Milestone} title="Development Progress" />

      <div className="flex flex-1 flex-col justify-center">
        <p className="flex items-center gap-3 text-3xl font-semibold text-gray-900">
          จาก feature ที่แยกกัน
          <ArrowRight className="h-7 w-7 text-(--color-primary)" />
          <span className="text-(--color-primary)">
            เริ่มเชื่อมเป็นระบบเดียว
          </span>
        </p>

        <div className="relative mt-14">
          <div className="absolute top-4 right-[8%] left-[8%] h-0.5 bg-(--color-border)" />
          <ol className="relative grid grid-cols-6 gap-4">
            {MILESTONES.map((item, i) => (
              <li
                key={`${item.title}-${i}`}
                className="flex flex-col items-center"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-(--color-bg) ${STATUS_DOT[item.status]}`}
                >
                  <StatusIcon status={item.status} />
                </span>
                <div
                  className={`mt-5 flex min-h-[230px] w-full flex-1 flex-col gap-2.5 rounded-xl border bg-(--color-surface) p-5 shadow-sm ${
                    item.highlight ? "border-2 border-(--color-primary)" : ""
                  }`}
                >
                  {item.highlight && (
                    <span className="badge-admin self-start">ไฮไลต์รอบนี้</span>
                  )}
                  <p className="text-base leading-snug font-semibold text-gray-900">
                    {item.title}
                  </p>
                  <p className="text-sm text-gray-600">{item.detail}</p>
                  <span className={`${STATUS[item.status]} mt-auto self-start`}>
                    {item.label}
                  </span>
                  {item.note && (
                    <p className="text-xs text-(--color-text-muted)">
                      {item.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10 flex items-center gap-5 text-sm text-(--color-text-muted)">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-(--color-success)" />{" "}
            เสร็จแล้ว
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-(--color-secondary)" />{" "}
            กำลังทดสอบ
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-(--color-warning)" />{" "}
            ถัดไป
          </span>
        </div>
      </div>
    </div>
  );
}

// --- Slide 3: What changed this round ------------------------------------------------

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-gray-700">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-secondary)" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CardTitle({
  icon: Icon,
  title,
  badge,
}: {
  icon: typeof Layers;
  title: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--color-primary-light) text-(--color-primary)">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {badge}
    </div>
  );
}

function OcrPreview() {
  const ready = demoOcr.rows.filter((row) => row.status === "ready").length;
  return (
    <div className="rounded-xl border bg-(--color-surface)">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">ตัวอย่างตารางเรียน</p>
          <p className="text-xs text-gray-500">
            {demoOcr.imageCount} ภาพ · รวมรายการซ้ำออก{" "}
            {demoOcr.duplicatesMerged} รายการ · พร้อมนำเข้า {ready} รายการ
          </p>
        </div>
        <span className="btn-primary px-3 py-1.5 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5" />
          ยืนยันและนำเข้า
        </span>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="px-3 py-2 font-normal">สถานะ</th>
            <th className="px-2 py-2 font-normal">รหัสวิชา</th>
            <th className="px-2 py-2 font-normal">Section</th>
            <th className="px-2 py-2 font-normal">ชื่อวิชา</th>
            <th className="px-2 py-2 font-normal">ประเภท</th>
            <th className="px-2 py-2 font-normal">เวลา</th>
            <th className="px-3 py-2 font-normal">ห้อง</th>
          </tr>
        </thead>
        <tbody>
          {demoOcr.rows.map((row) => (
            <tr
              key={`${row.courseCode}-${row.section}`}
              className="border-b align-top last:border-0"
            >
              <td className="px-3 py-2 text-green-700">
                {row.status === "ready"
                  ? "พร้อม"
                  : row.status === "warning"
                    ? "คำเตือน"
                    : "ต้องแก้ไข"}
              </td>
              <td className="px-2 py-2 font-medium text-gray-900">
                {row.courseCode}
              </td>
              <td className="px-2 py-2">{row.section}</td>
              <td className="max-w-36 truncate px-2 py-2">{row.courseName}</td>
              <td className="px-2 py-2">{row.classType}</td>
              <td className="px-2 py-2 whitespace-nowrap">
                {row.startTime}-{row.endTime}
                <span className="block text-gray-500">
                  {row.slot
                    ? getSlotLabel(row.slot).split(" · ")[0]
                    : "ไม่ตรงคาบ"}
                </span>
              </td>
              <td className="px-3 py-2">{row.room}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const OCR_FLOW = ["Upload", "OCR", "Parse", "Preview", "Import"];

function ChangesSlide() {
  return (
    <div className="flex h-full flex-col px-14 py-10">
      <SlideHeader icon={Layers} title="What Changed This Round" />

      <div className="mt-6 grid min-h-0 flex-1 grid-cols-2 gap-6">
        {/* A. OCR - the highlight */}
        <div className="flex flex-col gap-4 rounded-xl border-2 border-(--color-primary) bg-(--color-surface) p-6 shadow-sm">
          <CardTitle
            icon={FileImage}
            title="BU Mobile OCR"
            badge={<span className="badge-admin">ไฮไลต์รอบนี้</span>}
          />

          <div className="flex items-center gap-1">
            {OCR_FLOW.map((step, i) => (
              <span key={step} className="flex items-center gap-1">
                <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                  {step}
                </span>
                {i < OCR_FLOW.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                )}
              </span>
            ))}
          </div>

          <Bullets
            items={[
              "Screenshot ตารางเรียนจาก BU Mobile",
              "Tesseract.js (Thai + English) + custom parser",
              "Multi-image merge / dedupe",
              "Map เข้า AcademicSlot + match ห้องกับ Room inventory จริง",
              "Preview / Edit ก่อนเข้า ClassSchedule",
            ]}
          />

          <ProductVisual className="mt-auto flex flex-col gap-1.5">
            <OcrPreview />
            <SampleCaption>
              ผลจาก OCR parser จริง · screenshot ตัวอย่าง 2 ภาพที่ซ้อนกัน
            </SampleCaption>
          </ProductVisual>
        </div>

        <div className="flex min-h-0 flex-col gap-6">
          {/* B. Room booking */}
          <div className="card flex flex-1 flex-col gap-4 p-6">
            <CardTitle
              icon={CalendarCheck}
              title="Room Booking"
              badge={<span className={STATUS.done}>ใช้งานได้</span>}
            />
            <div className="grid grid-cols-[1fr_220px] gap-5">
              <Bullets
                items={[
                  "Room Finder ตามวัน / slot / จำนวนคน / capability",
                  "Solo + Group Booking",
                  "บันทึก participant snapshot ตอนจอง",
                  "Group เปลี่ยนภายหลัง ไม่เปลี่ยนสิทธิ์ booking เดิม",
                ]}
              />
              <ProductVisual className="rounded-xl border p-3">
                <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-gray-900">
                  <Users className="h-3.5 w-3.5" />
                  ผู้เข้าร่วมการจอง ({demoParticipants.length} คน)
                </p>
                <ul className="space-y-1.5">
                  {demoParticipants.map((p) => (
                    <li
                      key={p.studentId}
                      className="flex items-center gap-1.5 text-xs text-gray-700"
                    >
                      <User className="h-3 w-3 shrink-0 text-gray-400" />
                      <span className="truncate">{p.name}</span>
                      {p.isCreator && (
                        <span className="badge bg-blue-50 px-1.5 text-blue-700">
                          ผู้จอง
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </ProductVisual>
            </div>
          </div>

          {/* C. Admin approval */}
          <div className="card flex flex-1 flex-col gap-4 p-6">
            <CardTitle
              icon={ShieldCheck}
              title="Admin Approval"
              badge={
                <span className={`${STATUS.qa} gap-1`}>
                  <Loader2 className="h-3 w-3" />
                  Browser QA กำลังทดสอบ
                </span>
              }
            />
            <div className="grid grid-cols-[1fr_220px] gap-5">
              <Bullets
                items={[
                  "AUTO → Approved · MANUAL → Pending",
                  "Approve / Reject (แนบ note ได้)",
                  "Re-check availability, capacity และ overlap ก่อนอนุมัติ",
                ]}
              />
              <ProductVisual className="flex flex-col gap-2 rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs">
                    <p className="font-semibold text-gray-900">LAB-01</p>
                    <p className="text-gray-500">
                      {formatAcademicDate(DEMO_DATE)} · คาบ 3
                    </p>
                  </div>
                  <BookingStatusBadge status="PENDING" />
                </div>
                <div className="flex gap-1.5">
                  <span className="btn-primary flex-1 px-2 py-1 text-xs">
                    อนุมัติ
                  </span>
                  <span className="btn-danger flex-1 px-2 py-1 text-xs">
                    ปฏิเสธ
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <BookingStatusBadge status="APPROVED" />
                  <span>/</span>
                  <BookingStatusBadge status="REJECTED" />
                </div>
              </ProductVisual>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Slide 4: Toward on-site pilot ---------------------------------------------------

function FlowNode({
  x,
  y,
  w,
  h,
  icon: Icon,
  label,
  sub,
  variant = "default",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  icon: typeof Layers;
  label: string;
  sub?: string;
  variant?: "default" | "center" | "next";
}) {
  const style =
    variant === "center"
      ? "border-2 border-(--color-primary) bg-(--color-surface) ring-4 ring-(--color-primary-light)"
      : variant === "next"
        ? "border border-dashed border-gray-300 bg-gray-50"
        : "border bg-(--color-surface)";
  return (
    <div
      className={`absolute flex items-center gap-2.5 rounded-xl px-3 shadow-sm ${style}`}
      style={{ left: x, top: y, width: w, height: h }}
    >
      <Icon
        className={`shrink-0 ${variant === "center" ? "h-6 w-6 text-(--color-primary)" : variant === "next" ? "h-4 w-4 text-gray-400" : "h-4 w-4 text-gray-600"}`}
      />
      <div className="min-w-0">
        <p
          className={`truncate font-semibold ${variant === "center" ? "text-base text-gray-900" : variant === "next" ? "text-sm text-gray-500" : "text-sm text-gray-900"}`}
        >
          {label}
        </p>
        {sub && (
          <p className="truncate text-xs text-(--color-text-muted)">{sub}</p>
        )}
      </div>
    </div>
  );
}

function IntegrationDiagram() {
  // Coordinates on an 800 x 322 canvas; solid = integrated, dashed = next.
  const line = "stroke-slate-400";
  return (
    <div className="relative" style={{ width: 800, height: 322 }}>
      <svg
        className="absolute inset-0"
        width={800}
        height={322}
        aria-hidden="true"
      >
        <defs>
          <marker
            id="deck-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-slate-400" />
          </marker>
        </defs>
        <g
          fill="none"
          strokeWidth={1.75}
          className={line}
          markerEnd="url(#deck-arrow)"
        >
          <path d="M 95 46 L 95 78" />
          <path d="M 180 100 L 470 100 L 470 160" />
          <path d="M 150 200 L 172 200" />
          <path d="M 337 200 L 370 200" />
          <path d="M 570 200 L 620 200" />
          <path d="M 254 280 L 254 224" />
          <path d="M 470 240 L 470 280" strokeDasharray="5 5" />
        </g>
      </svg>
      <span
        className="absolute text-xs text-(--color-text-muted)"
        style={{ left: 104, top: 52 }}
      >
        OCR + Preview
      </span>

      <FlowNode
        x={10}
        y={0}
        w={170}
        h={46}
        icon={Smartphone}
        label="BU Mobile"
        sub="screenshot"
      />
      <FlowNode
        x={10}
        y={78}
        w={170}
        h={44}
        icon={TableProperties}
        label="ClassSchedule"
      />
      <FlowNode
        x={0}
        y={176}
        w={150}
        h={48}
        icon={Search}
        label="Room Finder"
      />
      <FlowNode
        x={172}
        y={176}
        w={165}
        h={48}
        icon={CalendarCheck}
        label="Booking"
        sub="participant snapshot"
      />
      <FlowNode
        x={172}
        y={280}
        w={165}
        h={42}
        icon={ShieldCheck}
        label="Admin Approval"
        sub="ห้อง MANUAL"
      />
      <FlowNode
        x={370}
        y={160}
        w={200}
        h={80}
        icon={KeyRound}
        label="Room Entitlement"
        sub="จุดตัดสินสิทธิ์กลาง"
        variant="center"
      />
      <FlowNode
        x={620}
        y={176}
        w={180}
        h={48}
        icon={ScanFace}
        label="Face Access"
        sub="1 face match → 1 user"
      />
      <FlowNode
        x={380}
        y={280}
        w={180}
        h={42}
        icon={Cpu}
        label="Tracking Agent"
        sub="next integration"
        variant="next"
      />

      <div
        className="absolute flex flex-col gap-1 text-xs text-(--color-text-muted)"
        style={{ left: 640, top: 284 }}
      >
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-6 bg-slate-400" /> เชื่อมแล้ว
        </span>
        <span className="flex items-center gap-2">
          <span className="w-6 border-t-2 border-dashed border-slate-400" />{" "}
          ถัดไป
        </span>
      </div>
    </div>
  );
}

function PilotSlide() {
  return (
    <div className="flex h-full flex-col px-14 py-8">
      <SlideHeader icon={Flag} title="Toward On-site Pilot" />

      <div className="mt-5 flex gap-6">
        <div className="card flex flex-1 items-center justify-center p-5">
          <IntegrationDiagram />
        </div>
        <div className="card flex w-[296px] shrink-0 flex-col gap-3 p-5 text-sm">
          <p className="font-semibold text-gray-900">Room Entitlement</p>
          <div>
            <p className="mb-1.5 text-xs font-medium text-green-700">
              ให้สิทธิ์จาก
            </p>
            <ul className="space-y-1.5 text-gray-700">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>
                  ClassSchedule
                  <span className="block text-xs text-gray-500">
                    ห้อง · วัน · เวลา · เข้าก่อน 30 นาที
                  </span>
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                Approved Booking participant
              </li>
            </ul>
          </div>
          <div className="border-t pt-3">
            <p className="mb-1.5 text-xs font-medium text-red-700">
              ไม่ให้สิทธิ์
            </p>
            <ul className="space-y-1 text-gray-700">
              {[
                "Pending / Rejected / Cancelled",
                "ผิดห้อง",
                "ผิดเวลา",
                "ไม่อยู่ใน participant snapshot",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_1.25fr_1fr] gap-4">
        <div className="card p-4">
          <span className={`${STATUS.qa} gap-1`}>
            <Loader2 className="h-3 w-3" />
            Current validation
          </span>
          <ul className="mt-2.5 space-y-1 text-sm text-gray-700">
            <li>Admin approve / reject — Browser QA</li>
            <li>Local runtime stabilization</li>
            <li>Real-device Face validation</li>
          </ul>
        </div>
        <div className="card p-4">
          <span className="badge bg-gray-100 text-gray-700">
            Next — before / during pilot
          </span>
          <ul className="mt-2.5 space-y-1 text-sm text-gray-700">
            <li>Tracking Agent → Room Entitlement</li>
            <li>Harden legacy Gate / Session</li>
            <li>Configure pilot machines / rooms</li>
            <li>Logging + feedback collection</li>
          </ul>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <TriangleAlert className="h-3.5 w-3.5" />
            Known limitations
          </p>
          <ul className="mt-2.5 space-y-1 text-sm">
            <li>Guest Face access ยังไม่เปิดใช้</li>
            <li>Admin / SuperAdmin access policy รอ confirm</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-(--color-primary-light) px-5 py-3">
        <Flag className="h-5 w-5 text-(--color-primary)" />
        <span className="text-sm text-(--color-text-muted)">
          Next milestone
        </span>
        <span className="text-lg font-semibold text-(--color-cta)">
          On-site pilot deployment
        </span>
      </div>
    </div>
  );
}

// --- Deck ---------------------------------------------------------------------------

export const DECK_SLIDES: DeckSlide[] = [
  {
    id: "opening",
    content: <OpeningSlide />,
    notes:
      "วันนี้ฟาขอมาอัปเดต Elegant Solution แบบสั้น ๆ ก่อนค่ะ ว่าจากรอบที่แล้วตอนนี้พัฒนาไปถึงไหนแล้ว แล้วส่วนต่าง ๆ ของระบบเริ่มเชื่อมกันยังไงบ้าง เพราะ milestone ถัดไปของเราคือเตรียมเอาไปลงเครื่องทดลองใช้จริงที่บริษัทค่ะ",
  },
  {
    id: "progress",
    content: <ProgressSlide />,
    notes:
      "รอบนี้ไม่ได้โฟกัสแค่เพิ่ม feature ใหม่ แต่โฟกัสให้ข้อมูลตั้งแต่ตารางเรียน การจองห้อง ไปจนถึงสิทธิ์เข้าห้องเริ่มใช้ logic เดียวกันมากขึ้นค่ะ",
  },
  {
    id: "changes",
    content: <ChangesSlide />,
    notes:
      "OCR เป็น feature ใหม่ที่เห็นชัดที่สุดรอบนี้ จากเดิมที่การเอาตารางเรียนเข้าระบบต้องพึ่ง Admin ตอนนี้นักศึกษาสามารถใช้ screenshot จาก BU Mobile ได้เอง ระบบจะอ่าน แยกข้อมูล รวมหลายภาพ และให้ preview แก้ก่อน import เข้า ClassSchedule ค่ะ",
  },
  {
    id: "pilot",
    content: <PilotSlide />,
    notes:
      "ตอนนี้ระบบเริ่มมีจุดตัดสินสิทธิ์กลางแล้ว ทั้ง ClassSchedule และ booking ที่อนุมัติแล้วสามารถกลายเป็นสิทธิ์เข้าใช้ห้องได้ งานรอบถัดไปจะเปลี่ยนจาก feature development ไปเป็นการ validate กับ environment จริง และเตรียมเครื่องสำหรับ pilot ค่ะ\n\n→ ปิด: “อันนี้คือภาพรวม progress ตอนนี้ค่ะ เดี๋ยวต่อไปขอพาไปดูของจริงในระบบ ตั้งแต่ฝั่งนักศึกษา การนำเข้าตาราง Room Finder การจอง ไปจนถึงฝั่ง Admin ค่ะ”",
  },
];
