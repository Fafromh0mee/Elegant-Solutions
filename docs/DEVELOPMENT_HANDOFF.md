# Zenith Development Handoff

เอกสารนี้สรุปสถานะล่าสุดสำหรับการกลับมาทำงานต่อในครั้งถัดไป

## สถานะที่ทำเสร็จแล้ว

- Room Finder และ Available Now สำหรับ student/guest พร้อมการกรองสิทธิ์ฝั่ง server
- การจองห้องและ participant snapshot ตาม flow ที่มีอยู่
- Room Finder หลักของ student/guest ใช้เส้นทาง `/dashboard/rooms`
  - เพิ่ม route `/dashboard/rooms`
  - เพิ่ม route `/dashboard/rooms/[roomId]/book`
  - route `/rooms` เดิมยังคงอยู่เพื่อรองรับลิงก์เก่า
- BU Mobile timetable OCR V1
  - parser รองรับ course block, course name, room, class type, slot, day และ semester
  - มีการ merge/dedupe แถวที่มาจากภาพซ้อนกัน
  - server ใช้ user id จาก session เท่านั้น
  - Admin CSV/XLSX import ไม่เกี่ยวข้องและยังคงแยกจาก OCR
- Student Dashboard OCR UX
  - ถ้า student มี `ClassSchedule` อย่างน้อยหนึ่งรายการใน `ACTIVE_SEMESTER` จะซ่อน OCR import section ทั้งส่วน
  - schedule จาก semester เก่าไม่ทำให้ section หาย
  - การตรวจใช้ `getActiveSemester()` และ `userId` จาก auth/session
- แก้ React warnings/errors
  - SVG attributes ใน Navbar ใช้ JSX names เช่น `strokeWidth`, `strokeLinecap`, `stopColor`
  - `GateClock` ไม่ใช้เวลาที่คำนวณตอน server render จึงไม่เกิด hydration mismatch

## Commit สำคัญล่าสุด

- `332ea65` participant snapshots / group booking baseline
- `d48efdc` Room Finder และ current-slot availability
- `38c69a1` BU Mobile timetable OCR import
- `4c09e8e` route Room Finder ผ่าน dashboard
- `9209858` admin approval และ room entitlement
- `afbb991` pilot progress presentation

งานแก้ล่าสุดของ OCR visibility, GateClock และ Navbar จะอยู่ใน commit ที่สร้างต่อจากเอกสารนี้

## การตรวจสอบล่าสุด

คำสั่งในโฟลเดอร์ `web` ใช้ `--ignore-workspace` เพราะ `web/pnpm-workspace.yaml` ยังเป็นไฟล์ที่ต้องเก็บไว้นอก commit:

```bash
pnpm --ignore-workspace exec vitest run src/actions/ocr-timetable.test.ts src/lib/ocr-timetable.test.ts
pnpm --ignore-workspace exec tsc --noEmit
pnpm --ignore-workspace exec eslint <changed-files>
```

ผลล่าสุด:

- OCR focused tests: 24 ผ่าน
- TypeScript: ผ่าน
- ESLint: ไม่มี error; มี warning เดิมเรื่อง dependencies ของ `useEffect` ใน dashboard
- `git diff --check`: ผ่าน

## รัน local

```bash
cd /Users/fafromh0me/Developer/Zenith/web
pnpm --ignore-workspace dev
```

เปิด `http://localhost:3000` ถ้า port ว่าง หากมี Next dev process เดิมอยู่ ให้หยุดด้วย `Ctrl+C` ก่อนเริ่มใหม่

## ไฟล์ที่ต้องระวัง

อย่า stage หรือแก้โดยไม่ตรวจสอบก่อน:

- `docs/LAB_ACCESS_V2_PLAN.md`
- `backups/`
- `web/pnpm-workspace.yaml`

ไฟล์เหล่านี้เป็นงานค้าง/ไฟล์ประกอบที่ไม่ควรถูกรวมไปกับ feature commit โดยอัตโนมัติ

## ข้อจำกัด OCR V1

- OCR อาจอ่านผิดเมื่อภาพเบลอ ถูก crop หรือมี UI noise มาก
- แถวที่ room หรือ field สำคัญไม่แน่ชัดต้องให้ผู้ใช้ตรวจสอบก่อน import
- class type ที่ยังสรุปไม่ได้ เช่น `EN103` จะเป็น warning ไม่ใช่การเดา
- ต้องมี room ที่ตรงกับข้อมูลในระบบจึงจะ import ได้
- OCR ทำงานผ่าน browser/Tesseract.js และพึ่งพาการโหลด language data จาก CDN

## แนวทางทำงานต่อ

ก่อนเริ่มงานครั้งถัดไปให้ตรวจ `git status` และแยกงานค้างตาม feature ก่อนเสมอ โดยเฉพาะ Room Booking, Feature 7.5 และเอกสารแผน LAB Access อย่ารวมเข้ากับ feature ใหม่โดยไม่ได้ตั้งใจ
