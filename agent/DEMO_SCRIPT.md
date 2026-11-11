# บทสาธิตสอบปฏิบัติ Elegant Solution Tracking Agent

**Preflight จำเป็น:** backend จริง `https://elegant.fafromh0me.com` ยังไม่มี `/api/agent/activate` ตามการตรวจวันที่ 11 พ.ย. 2026. อย่าเริ่ม live activation จนกว่าจะอัปเดต backend/migrations และตรวจ endpoint; ถ้ายังไม่พร้อม ใช้ fallback ที่ระบุท้ายเอกสาร.

## 0–2 นาที: สถาปัตยกรรม

เปิดภาพโครงสร้างหรืออธิบาย: `session_ui.py` (desktop) → local bridge → `machine_service.py` (service) → `/api/agent/*` → PostgreSQL → Admin Tracking. ชี้ว่า service ส่ง machine-only heartbeat ได้ก่อน student login; API key ไม่อยู่ใน UI; ทั้งสาม OS ใช้ core เดียวกันแต่ installer/startup ต่างกัน.

## 2–4 นาที: Batch Enrollment

1. Login Super Admin ที่ `/admin/system`, เปิด **Tracking Agent Deployment**.
2. เลือกห้องทดลอง, สร้าง Batch 1 เครื่อง (หรือ 30 เครื่องสำหรับโจทย์ขยาย), แสดงว่า browser ดาวน์โหลด CSV ครั้งเดียว.
3. ชี้คอลัมน์ `machine_code`, `activation_code`, `expires_at`; อย่าฉายรหัสจริงบนหน้าจอผู้ชม. อธิบายว่าแต่ละเครื่องใช้หนึ่งรหัส, UI แสดง pending/activated/revoked/expired และ hostname/OS หลัง activation.
4. สำหรับโจทย์ 30 เครื่อง: ทำ Batch 30, แจก CSV ให้ IT ผ่านช่องทางปลอดภัย, ติดตั้ง package เดียวกันบน 30 เครื่อง, ใช้รหัสคนละแถว, ดู progress `activated/30`. หากมีเพียงเครื่องเดียว ให้สาธิต 1 เครื่องจริงและอธิบายขั้นตอนที่เหลือ; อย่าอ้างว่าติดตั้งครบ 30.

## 4–9 นาที: ติดตั้งและรับข้อมูลจริง

เลือกเครื่องจริงที่มีพร้อมก่อนสอบ. ตรวจ URL/backend และ checksum, ติดตั้งตามคู่มือ OS:

- Windows: `ElegantAgentSetup_0.5.0_x64.exe` แบบ Administrator → `Get-Service ElegantSolutionsMachine`.
- macOS: `sudo installer -pkg elegant-agent_0.5.0_darwin_$(uname -m).pkg -target /` → `sudo launchctl print system/com.elegantsolution.agent.machine`.
- Ubuntu: `sudo apt install ./elegant-agent_0.5.0_amd64.deb` → `systemctl status elegant-agent.service --no-pager`.

UI กรอกรหัสจาก CSV ของเครื่องนี้ → แสดง machine code/room → เปิด Admin Tracking และรอ machine online จาก heartbeat จริง. นักศึกษา login ผ่าน UI ด้วยบัญชีที่มี room entitlement → เปิด app ตัวอย่าง → refresh dashboard ให้เห็น activity จริง. Logout → รอ heartbeat อีกหนึ่งรอบ → แสดงว่า machine ยัง online แต่ไม่มี user activity. ห้ามใช้ mock/fake log เป็นหลักฐาน demo.

## 9–12 นาที: Recovery และคำถาม

หากเวลาพอ reboot เครื่องจริงและตรวจ service/UI/online. หาก reboot ไม่ได้ ให้แสดง startup config แล้วระบุว่า reboot ยังไม่ verified. ตอบกรณี backend outage, wrong/expired/revoked code, duplicate activation, revoked machine, crash, update, uninstall โดยใช้ [EXAM_CHEAT_SHEET.md](EXAM_CHEAT_SHEET.md). ตรวจ X11/Wayland หรือ macOS Privacy permission ตาม OS ที่สาธิต; อย่าอ้างว่ามี window title หาก API ส่ง `null`.

## Fallback ที่ซื่อสัตย์

หาก Windows/Intel Mac/Ubuntu ไม่พร้อม ให้เปิด artifact/CI result และคู่มือของ OS นั้น พร้อมบอกชัดว่า “build ผ่าน แต่ยังไม่ได้ติดตั้ง/activate/reboot บน OS จริง”. หาก backend หรือ database schema ไม่พร้อม ให้แสดง unit/DB test จากฐานข้อมูลแยกและชี้ migration blocker; อย่าประดิษฐ์ telemetry. หาก package macOS unsigned ถูกนโยบายเครื่องปฏิเสธ ให้หยุดติดตั้ง, ใช้เครื่องทดสอบที่ได้รับอนุญาตหรือสาธิตหลักฐาน build/architecture; ห้ามปิด Gatekeeper ทั้งระบบ.
