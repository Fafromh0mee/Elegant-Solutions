# ติดตั้ง Tracking Agent บน Windows 10/11 x64

## เตรียม Batch และ installer

1. ให้ทีม backend อัปเดต schema และเปิด HTTPS backend ที่เครื่องห้องปฏิบัติการติดต่อได้.
2. Super Admin เปิด `/admin/system` → **Tracking Agent Deployment** → เลือกห้องและจำนวนเครื่อง → สร้าง Batch. Browser ดาวน์โหลด CSV ที่มีรหัสหกหลัก **ครั้งเดียว**; เก็บไฟล์ในที่ปลอดภัยและแจกหนึ่งรหัสต่อเครื่อง.
3. Build บน Windows ด้วย Python 3.12 และ Inno Setup 6 จาก `agent/`:

```bat
set ELEGANT_SERVER_URL=https://pilot.example.com
build.bat
```

ผลลัพธ์คือ `release\ElegantAgentSetup_0.5.0_x64.exe`; ตรวจ SHA-256 ใน `release\SHA256SUMS.txt` และยืนยันว่า release ไม่มี `config.json`, `.env`, API key หรือ CSV.

## ติดตั้งและพิสูจน์บนเครื่องจริง

1. คลิกขวา EXE → **Run as administrator**. Installer ลง Windows Service `ElegantSolutionsMachine`, ตั้ง recovery หลัง crash และลงทะเบียน UI ใน `HKLM\Software\Microsoft\Windows\CurrentVersion\Run` ให้เปิดเมื่อผู้ใช้ OS login.
2. UI ถามรหัสหกหลักจาก CSV. กรอกหนึ่งรหัส; ตรวจ `machineCode` และ `roomCode` ใน UI.
3. เปิด PowerShell แบบ Administrator:

```powershell
Get-Service ElegantSolutionsMachine
sc.exe qc ElegantSolutionsMachine
Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' -Name ElegantAgentUI
Test-Path "$env:ProgramData\ElegantSolution\Agent\config.json"
```

4. เปิด Admin → Tracking; machine ต้องออนไลน์หลัง heartbeat 10–30 วินาที. ตรวจ hostname/room.
5. นักศึกษา login ผ่าน UI ด้วยบัญชีที่มีสิทธิ์ห้อง → เปิดโปรแกรมตัวอย่าง → ตรวจ activity ใน Admin Tracking → logout → ยืนยัน heartbeat ยังออนไลน์และไม่มีข้อมูลผู้ใช้/หน้าต่างใหม่.
6. Reboot แล้วตรวจ `Get-Service` และ dashboard อีกครั้งโดยไม่กรอกรหัสเปิดใช้งานซ้ำ.

## Path และบำรุงรักษา

- โปรแกรม: `C:\Program Files\ElegantSolution\Agent\`
- Config/API key และ logs: `C:\ProgramData\ElegantSolution\Agent\` (SYSTEM/Administrators)
- Token เชื่อม UI: `C:\ProgramData\ElegantSolution\AgentBridge\token` (ผู้ใช้เครื่องอ่านได้)
- Restart: เปิด `C:\Program Files\ElegantSolution\Agent\restart.bat` แบบ Administrator แล้วกรอก maintenance code ชนิด `RESTART_AGENT`.
- Uninstall: เปิด `C:\Program Files\ElegantSolution\Agent\uninstall.bat` แบบ Administrator แล้วกรอก `UNINSTALL_AGENT`.
- Update: ติดตั้ง EXE เวอร์ชันใหม่ทับ; config ใน ProgramData ไม่อยู่ใน installer และจะคงอยู่. ตรวจ service/activation/heartbeat หลัง update.

## แก้ปัญหา

- UI แจ้ง “Machine service ไม่พร้อม”: ตรวจ `Get-Service ElegantSolutionsMachine`, Event Viewer → Windows Logs → Application และ log ใน ProgramData; ให้ service เริ่มก่อน UI.
- รหัสผิด/หมดอายุ/ใช้แล้ว: ใช้รหัสใหม่จาก Batch ใหม่; อย่าแจก CSV เดิมซ้ำ. หากถูกจำกัดจำนวนครั้ง ให้รอตาม `Retry-After`.
- Backend offline: ตรวจ HTTPS URL ใน `deployment.json`, DNS และ firewall; service ลอง heartbeat ใหม่ทุก 10 วินาที.
- UI ไม่เปิดหลัง login: ตรวจ registry Run แล้วเปิด `ElegantAgentUI.exe` จาก Program Files ด้วยมือ.
- เครื่องถูก revoke: heartbeat จะไม่สำเร็จและ dashboard จะ offline. การ revoke Batch หลัง activation ไม่ได้ revoke เครื่องที่เปิดใช้งานแล้ว.

ยังไม่มีหลักฐานการติดตั้งบน Windows จริงจากเครื่องพัฒนานี้; ต้องทดสอบขั้นตอนข้างต้นบน Windows 10/11 x64 ก่อนสอบ.
