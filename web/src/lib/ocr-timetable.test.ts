import { describe, expect, it } from "vitest";
import {
  normalizeClassType,
  normalizeDay,
  normalizeRoom,
  normalizeTime,
  parseOcrBatch,
  validateOcrRows,
} from "@/lib/ocr-timetable";

describe("OCR timetable normalization", () => {
  it("normalizes English, abbreviated, and Thai days", () => {
    expect(normalizeDay("Mon.")).toEqual({ dayOfWeek: 1, label: "Monday" });
    expect(normalizeDay("พุธ")).toEqual({ dayOfWeek: 3, label: "Wednesday" });
  });

  it("uses O/0 correction only for time fields", () => {
    expect(normalizeTime("O840")).toBe("08:40");
    expect(normalizeTime("1O:2O")).toBe("10:20");
    expect(normalizeRoom("o101")).toBe("O101");
  });

  it("normalizes class types", () => {
    expect(normalizeClassType("lecture")).toBe("LECT");
    expect(normalizeClassType("laboratory")).toBe("LAB");
    expect(normalizeClassType("RWS")).toBe("RWS");
  });
});

describe("OCR timetable parsing", () => {
  it("keeps Friday, Saturday, and Tuesday blocks on their own days in the supplied BU screenshots", () => {
    // Transcribed from the additional real screenshots; OCR text may vary by browser.
    const friday = `Class Schedule
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
No.
N/A
CS250 / 227G 14.30 - 16.50
Discrete Structures
(LECT)
Room
A4-405`;
    const saturday = `Class Schedule
Semester 67 (A.D. 2024) / 2
Room
A4-405
No.
N/A
SATURDAY
CS320 / 227F 08.40 - 11.00
Computer Organization and Architecture(for SC)
(LECT)
Room
A5-1202
No.
N/A
ST207 / 127B 12.00 - 14.20
Probability and Statistics
(LECT)
Room
C2-602
No.
N/A
SUNDAY`;
    const tuesday = `Class Schedule
Semester 67 (A.D. 2024) / 2
TUESDAY
CS403 / 227D 08.40 - 11.00
Systems Analysis and Design
(LECT)
Room
B4-607
No.
N/A
WEDNESDAY
No Class Today
THURSDAY`;
    const batch = parseOcrBatch([friday, saturday, tuesday]);
    expect(batch.semester).toBe("2/2024");
    expect(batch.rows).toHaveLength(6);
    expect(batch.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ courseCode: "CS454", dayLabel: "Friday", courseName: "Computer Communication Networks", classType: "LECT", room: "B4-303", slot: "SLOT_1" }),
      expect.objectContaining({ courseCode: "CS413", dayLabel: "Friday", courseName: "Automata, Computability, and Formal Languages", room: "A6-304", slot: "SLOT_2" }),
      expect.objectContaining({ courseCode: "CS250", dayLabel: "Friday", courseName: "Discrete Structures", room: "A4-405", slot: "SLOT_3" }),
      expect.objectContaining({ courseCode: "CS320", dayLabel: "Saturday", courseName: "Computer Organization and Architecture(for SC)", room: "A5-1202", slot: "SLOT_1" }),
      expect.objectContaining({ courseCode: "ST207", dayLabel: "Saturday", courseName: "Probability and Statistics", room: "C2-602", slot: "SLOT_2" }),
      expect.objectContaining({ courseCode: "CS403", dayLabel: "Tuesday", courseName: "Systems Analysis and Design", room: "B4-607", slot: "SLOT_1" }),
    ]));
  });

  const buImageOne = `17:39 9 HER 7 J
£ Class Schedule
Hello,
Nantita Damrongpanawan ๑
Semester 68 (A.D. 2025) /1 ” —
WEDNESDAY
8 CS350 / 227D 08.40 - 11.00
Data Structures (for CS.)
(LECT)
Room No.
A4-303 8 9
8 CS422 / 327E 12.00 - 14.20
Operating Systems (for SC.)
(LAB)
Room No.
A4-404 39 9
8 CS461 / 427D 14.30 - 16.50
Neural Networks and Deep Learning
(LAB)
Room No.
B4-506 39 0
8 EN103 / 216M 17.00 - 19.20
(ๆ v &
Home Services News EY)`;

  const buImageTwo = `17:39 9 0! FT Eh
£ Class Schedule
Hello,
Nantita Damrongpanawan ๑
Semester 68 (A.D. 2025) /1 ” —
Room No.
A4-303 3 i
8 CS422 / 327E 12.00 - 14.20
Operating Systems (for SC.)
(เล 8)
Room No.
A4-404 39 ป)
8 CS461 / 427D 14.30 - 16.50
Neural Networks and Deep learning
(เล 8)
Room No.
B4-506 39 9
ง EN103 / 216M 17.00 - 19.20
Global English
(ด ร )
Room No.
C2-705 1 9
(ๆ) v a2)
Home Services News EY)`;

  it("parses and merges the real BU Mobile multi-line fixture", () => {
    const batch = parseOcrBatch([buImageOne, buImageTwo]);
    expect(batch.studentName).toBe("Nantita Damrongpanawan");
    expect(batch.semester).toBe("1/2025");
    expect(batch.term).toBe(1);
    expect(batch.academicYearAD).toBe(2025);
    expect(batch.rows).toHaveLength(4);
    expect(batch.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ courseCode: "CS350", section: "227D", dayLabel: "Wednesday", slot: "SLOT_1", courseName: "Data Structures (for CS.)", classType: "LECT", room: "A4-303" }),
      expect.objectContaining({ courseCode: "CS422", section: "327E", slot: "SLOT_2", courseName: "Operating Systems (for SC.)", classType: "LAB", room: "A4-404" }),
      expect.objectContaining({ courseCode: "CS461", section: "427D", slot: "SLOT_3", courseName: "Neural Networks and Deep Learning", classType: "LAB", room: "B4-506" }),
      expect.objectContaining({ courseCode: "EN103", section: "216M", dayLabel: "Wednesday", slot: "SLOT_4", courseName: "Global English", room: "C2-705", classType: "", status: "warning" }),
    ]));
    expect(batch.rows.every((row) => !row.courseName.includes("Home Services News"))).toBe(true);
    expect(batch.rows.find((row) => row.courseCode === "EN103")?.warnings).toContain("ไม่พบประเภทวิชา");
    expect(batch.rows.find((row) => row.courseCode === "EN103")?.warnings).not.toContain("ไม่พบชื่อวิชา");
    expect(batch.debug.courseHeaders).toHaveLength(7);
    expect(batch.debug.blocks).toHaveLength(7);
    expect(batch.debug.mergeDecisions.find((decision) => decision.includes("CS422/327E"))).toContain("equivalent copy dropped");
    expect(batch.debug.mergeDecisions.find((decision) => decision.includes("CS461/427D"))).toContain("equivalent copy dropped");
    expect(batch.debug.mergeDecisions.find((decision) => decision.includes("EN103/216M"))).toContain("courseName");
    expect(JSON.parse(batch.debug.parsedRows.find((row) => row.includes('"courseCode":"EN103"')) ?? "{}")).toMatchObject({ courseName: "Global English", slot: "SLOT_4", semester: "1/2025", status: "warning" });
  });

  it("leaves a cropped course name empty when only BU Mobile navigation text follows", () => {
    for (const footer of ["Home", "Services", "News", "Home Services News", "Home Services News EY)"]) {
      const batch = parseOcrBatch([`Semester: 1/2025\nWEDNESDAY\n8 EN103 / 216M 17.00 - 19.20\n${footer}`]);
      expect(batch.rows[0].courseName).toBe("");
      expect(batch.rows[0].warnings).toContain("ไม่พบชื่อวิชา");
    }
  });

  it("maps exact canonical times and inherits an unambiguous semester", () => {
    const batch = parseOcrBatch([
      "Student: Alice Example\nSemester: 2 / 2026\nMonday | CS101 | 123A | Intro to CS | LECT | 08:40-11:00 | A101",
    ]);
    expect(batch.semester).toBe("2/2026");
    expect(batch.studentName).toBe("Alice Example");
    expect(batch.rows).toHaveLength(1);
    expect(batch.rows[0]).toMatchObject({ dayOfWeek: 1, courseCode: "CS101", slot: "SLOT_1", room: "A101", status: "ready" });
  });

  it("merges overlapping screenshots and prefers more complete values", () => {
    const batch = parseOcrBatch([
      "Semester: 2/2026\nMonday | CS101 | 123A | Intro | LECT | 08:40-11:00 | A101\nTuesday | MA201 | 222B | Calculus | LECT | 12:00-14:20 | B202",
      "Semester: 2/2026\nMonday | CS101 | 123A | Introduction to Computer Science | LECT | 08:40-11:00 | A101\nWednesday | EN301 | 111C | English | RWS | 14:30-16:50 | C303",
    ]);
    expect(batch.rows).toHaveLength(3);
    expect(batch.rows.find((row) => row.courseCode === "CS101")?.courseName).toBe("Introduction to Computer Science");
  });

  it("does not dedupe different classes and flags unsupported times", () => {
    const batch = parseOcrBatch([
      "Semester: 2/2026\nMonday | CS101 | 123A | Intro | LECT | 09:00-11:00 | A101\nMonday | CS101 | 123B | Intro | LECT | 08:40-11:00 | A101",
    ]);
    expect(batch.rows).toHaveLength(2);
    expect(batch.rows.find((row) => row.section === "123A")?.status).toBe("error");
  });

  it("warns on conflicting semesters and reports unresolved rooms", () => {
    const batch = parseOcrBatch([
      "Semester: 1/2026\nMonday | CS101 | 123A | Intro | LECT | 08:40-11:00 | A101",
      "Semester: 2/2026\nTuesday | MA201 | 222B | Math | LECT | 12:00-14:20 | Z999",
    ]);
    expect(batch.warnings[0]).toContain("ภาคการศึกษาหลายค่า");
    expect(validateOcrRows(batch.rows, ["A101"])).toEqual(expect.arrayContaining([expect.objectContaining({ room: "Z999", errors: expect.arrayContaining(["ไม่พบห้องในระบบ"]) })]));
  });
});
