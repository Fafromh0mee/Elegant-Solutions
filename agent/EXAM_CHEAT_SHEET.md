# ชีตสรุปสอบปฏิบัติ: Tracking Agent 0.5.0

## อธิบายระบบใน 60 วินาที

Elegant Solution ใช้ Python Agent core เดียวกันทุก OS และ Next.js/PostgreSQL backend. Machine service เก็บ machine identity/API key และส่ง heartbeat ทุก 10 วินาทีแม้ยังไม่มีนักศึกษา login. Desktop UI เป็นโปรเซสแยก รับรหัสเปิดใช้งาน, ให้ผู้ใช้ login และอ่าน foreground app/title เฉพาะตอนมี Agent session. UI ส่งข้อมูลผ่าน `127.0.0.1:18767` โดย local token; service เป็นผู้ส่งไป API. Backend ผูก session กับเครื่อง/ห้องและแสดงสถานะใน Admin Tracking.

Windows ใช้ Windows Service + registry Run; macOS ใช้ LaunchDaemon + LaunchAgent; Ubuntu ใช้ systemd + XDG autostart เพราะกลไกเริ่มบริการและ graphical session ของแต่ละ OS ต่างกัน. UI ไม่อยู่ใน system service.

## ลำดับการสาธิต

1. Super Admin `/admin/system` เลือกห้องและจำนวน 1 หรือ 30 → สร้าง Batch → รับ CSV ครั้งเดียว. รหัสตัวเลข 6 หลักสุ่มด้วย `crypto.randomInt`, เก็บ hash, หมดอายุ 7 วัน, ใช้ได้ครั้งเดียว; per-IP/global durable rate limit และ revoke pending codes.
2. เลือก installer ตรง OS/architecture และตรวจ SHA-256. Installer มี backend URL เท่านั้น ไม่มี API key/CSV.
3. ติดตั้งด้วยสิทธิ์ administrator; machine service เริ่มเอง. กรอกรหัสจาก CSV ใน UI; backend คืน machine code, room และ API key ที่เก็บใน service data dir.
4. ดู machine online ใน Admin Tracking → login นักศึกษา → ดู activity → logout → ยืนยัน heartbeat ยังมา → reboot → ยืนยัน service/UI และ online โดยไม่ activate ซ้ำ.

## คำสั่งจำเป็น

| Windows PowerShell | macOS Terminal | Ubuntu Terminal |
| --- | --- | --- |
| `Get-Service ElegantSolutionsMachine` | `sudo launchctl print system/com.elegantsolution.agent.machine` | `systemctl status elegant-agent.service --no-pager` |
| `sc.exe qc ElegantSolutionsMachine` | `launchctl print gui/$(id -u)/com.elegantsolution.agent.session` | `journalctl -u elegant-agent.service -n 50 --no-pager` |
| `Test-Path "$env:ProgramData\ElegantSolution\Agent\config.json"` | `pkgutil --pkgs | grep com.elegantsolution.agent` | `dpkg -s elegant-agent` |

## เมื่อผู้สอบถามกรณีเสีย

- Backend/อินเทอร์เน็ตหาย: machine service ยังรัน; API heartbeat ล้มเหลวและ dashboard อาจ offline หลัง timeout; กลับมาแล้วส่งใหม่โดยไม่ activate ซ้ำ.
- รหัสผิด/หมดอายุ/ใช้แล้ว: API ปฏิเสธ; ออก Batch ใหม่. รหัสที่ใช้แล้วไม่ถูกนำกลับมาใช้.
- เครื่องถูก revoke: API key ใช้ไม่ได้และ dashboard offline; ไม่ใช่การ revoke Batch ซึ่งกระทบเฉพาะรหัสที่ยังไม่ใช้.
- Logout: ลบ Agent user session และหยุด activity; machine identity/heartbeat ยังอยู่.
- Crash/reboot: Windows Service recovery, LaunchDaemon KeepAlive, systemd Restart=always; UI กลับมาตอน login desktop. ต้องยืนยันบน OS จริง.
- Update: installer ใหม่ทับ binary โดยเก็บ config ใน service data dir. Uninstall/restart ต้องใช้ maintenance code ตาม action.
- Wayland: ไม่มี generic foreground title API; ส่ง `null` อย่างตรงไปตรงมา. X11 และ macOS Automation ต้องตรวจ permission/capability จริง.

## ข้อจำกัดที่ต้องพูดตรงๆ

- PKG macOS development build ยังไม่ signed/notarized; การแจกจ่ายทั่วไปต้องมี Apple Developer ID และตรวจ Gatekeeper ตามนโยบายเครื่อง. ห้ามอ้างว่าผ่าน notarization.
- Local bridge token ให้ผู้ใช้เครื่องอ่านได้เพื่อให้ GUI คุยกับ service; จึงเหมาะกับเครื่องแล็บที่ควบคุมบัญชี OS และหนึ่งผู้ใช้ interactive ต่อครั้ง. ผู้ใช้เครื่องที่ไม่เชื่อถืออาจส่ง activity ปลอมผ่าน bridge; เป็นประเด็น hardening ต่อไป.
- การ build package หรือ unit test ไม่ยืนยัน installation, network, dashboard, foreground privacy หรือ reboot จริง. เช็กลิสต์ในคู่มือแต่ละ OS ต้องรันบนเครื่องจริง.
- Fresh `prisma migrate deploy` ของ repository baseline ยังติด migration ห้องจองที่เรียงผิด (`20260922015501` อ้าง `room_bookings` ก่อน foundation `20260922090000`); ทดสอบ Agent schema กับ isolated DB โดย `prisma db push` เท่านั้น. ก่อนใช้ production ต้องแก้ลำดับ migration อย่างปลอดภัยและทดสอบกับฐานข้อมูลสำเนา.
- Installer download ใน `/admin/system` ทำงานเมื่อผู้ดูแล stage binary ที่ `AGENT_INSTALLER_DIR`; CI artifact ยังไม่ใช่ release และไม่ได้ deploy ให้อัตโนมัติ.
