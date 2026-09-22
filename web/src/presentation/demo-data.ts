import { resolveSlotRange } from "@/lib/academic-slots";
import { evaluateAvailability, type AvailabilityRoom, type RoomAvailabilityContext } from "@/lib/availability";
import { parseOcrBatch, validateOcrRows } from "@/lib/ocr-timetable";
import type { DashboardBooking } from "@/lib/room-booking-rules";
import type { RoomFinderSearchState } from "@/lib/room-finder";
import type { AcademicSlot } from "@/lib/types";

// Presentation-only static state. Every visual is produced by the REAL pure product
// logic (availability engine, OCR parser) from fixed inputs - no database, no side
// effects. Room codes and names are sample data.

export const DEMO_DATE = "2026-09-25"; // a Friday

// --- BU Mobile OCR: two overlapping screenshots (text modeled on a real BU Mobile capture) ---

const SCREENSHOT_1 = `Class Schedule
Semester 67 (A.D. 2024) / 2
FRIDAY
CS454 / 227F 08.40 - 11.00
Computer Communication Networks
(LECT)
Room
B4-303
No.
N/A
CS413 / 227A 12.00 - 14.20
Automata, Computability, and Formal Languages
(LECT)
Room
A6-304
Home Services News`;

const SCREENSHOT_2 = `Class Schedule
Semester 67 (A.D. 2024) / 2
FRIDAY
CS413 / 227A 12.00 - 14.20
Automata, Computability, and Formal Languages
(LECT)
Room
A6-304
No.
N/A
CS250 / 227G 14.30 - 16.50
Discrete Structures
(LECT)
Room
A4-405
Home Services News`;

const ocrBatch = parseOcrBatch([SCREENSHOT_1, SCREENSHOT_2]);

export const demoOcr = {
  imageCount: 2,
  semester: ocrBatch.semester,
  rows: validateOcrRows(ocrBatch.rows, ["B4-303", "A6-304", "A4-405"]),
  duplicatesMerged: ocrBatch.debug.mergeDecisions.filter((d) => d.includes("duplicate row detected")).length,
};

// --- Room Finder: real Feature 3 evaluator over static contexts ---

const DEMO_SLOTS: AcademicSlot[] = ["SLOT_2"];

function demoRoom(room: Omit<AvailabilityRoom, "isActive" | "bookingEnabled">): AvailabilityRoom {
  return { ...room, isActive: true, bookingEnabled: true };
}

function demoContext(room: AvailabilityRoom, approvedSeats: number): RoomAvailabilityContext {
  return {
    room,
    dayOfWeek: 5,
    activeSemester: "2/2024",
    windowSlots: ["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"],
    closures: [],
    classes: [],
    approvedPartySizeBySlot: { SLOT_2: approvedSeats },
    pendingPartySizeBySlot: {},
    configWarnings: [],
  };
}

const finderQuery = { date: DEMO_DATE, slots: DEMO_SLOTS, partySize: 4, capability: null, building: null, floor: null };
const finderRequest = { date: DEMO_DATE, slots: DEMO_SLOTS, partySize: 4 };

const finderResult = evaluateAvailability(
  demoContext(
    demoRoom({
      id: "demo-lab-01",
      roomCode: "LAB-01",
      name: "ห้องปฏิบัติการคอมพิวเตอร์ 1",
      approvalPolicy: "MANUAL",
      capabilities: ["LAB"],
      capacity: 20,
      building: "A6",
      floor: 3,
    }),
    6
  ),
  finderRequest
);

export const demoFinderSearch: RoomFinderSearchState = {
  kind: "DONE",
  query: finderQuery,
  available: [finderResult],
  unavailable: [],
  statusCounts: { AVAILABLE: 1 },
  totalAvailable: 1,
  limit: 6,
  availableTruncated: false,
  capabilityHasNoRooms: false,
  bookingClosedSlots: [],
};

// --- Dashboard "การจองของฉัน" ---

function demoBooking(booking: Omit<DashboardBooking, "startAt" | "endAt" | "inAccessWindow" | "date">): DashboardBooking {
  const first = resolveSlotRange(DEMO_DATE, booking.slots[0]);
  const last = resolveSlotRange(DEMO_DATE, booking.slots[booking.slots.length - 1]);
  return {
    ...booking,
    date: DEMO_DATE,
    startAt: first.startAt.toISOString(),
    endAt: last.endAt.toISOString(),
    inAccessWindow: false,
  };
}

export const demoMyBookings: DashboardBooking[] = [
  demoBooking({
    id: "demo-1",
    status: "APPROVED",
    partySize: 4,
    roomCode: "MEET-02",
    roomName: "ห้องประชุมกลุ่ม 2",
    slots: ["SLOT_2"],
    isCreator: true,
    creatorName: "สมชาย ใจดี",
  }),
  demoBooking({
    id: "demo-2",
    status: "PENDING",
    partySize: 3,
    roomCode: "LAB-01",
    roomName: "ห้องปฏิบัติการคอมพิวเตอร์ 1",
    slots: ["SLOT_3"],
    isCreator: false,
    creatorName: "สุดา ตั้งใจ",
  }),
];

export const demoParticipants = [
  { name: "สุดา ตั้งใจ", studentId: "1660700001", isCreator: true },
  { name: "สมชาย ใจดี", studentId: "1660700002", isCreator: false },
  { name: "วิภา รักเรียน", studentId: "1660700003", isCreator: false },
];

export const demoStudentId = "1660700002";
