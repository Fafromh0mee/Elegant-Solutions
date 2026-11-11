# ติดตั้ง Tracking Agent บน macOS

**จุดหยุดก่อนสอบ:** ณ 11 พ.ย. 2026 backend จริง `https://elegant.fafromh0me.com` ยังตอบ 404 ที่ `/api/agent/activate`; ต้องอัปเดต backend/migrations และตรวจ route นี้ก่อนใช้รหัสจริง.

รองรับ arm64 (Apple Silicon) และ x86_64 (Intel) ด้วย PKG คนละไฟล์. เลือกไฟล์ให้ตรงกับ `uname -m`. Machine component เป็น LaunchDaemon; UI เป็น LaunchAgent ที่เริ่มเมื่อ graphical user login.

## Build และข้อจำกัดการแจกจ่าย

ใช้ macOS ตาม architecture, Python 3.12 และ Xcode Command Line Tools:

```bash
cd agent
ELEGANT_SERVER_URL=https://elegant.fafromh0me.com PYTHON_BIN=python3.12 ./build-macos.sh
shasum -a 256 -c elegant-agent_0.5.0_darwin_$(uname -m).pkg.sha256
pkgutil --payload-files elegant-agent_0.5.0_darwin_$(uname -m).pkg
pkgutil --check-signature elegant-agent_0.5.0_darwin_$(uname -m).pkg
```

PKG ปัจจุบัน **ยังไม่ signed/notarized**. `pkgutil --check-signature` แสดง `no signature` และคืนสถานะ 1. หากเจ้าของเครื่องทดสอบอนุญาต ใช้ `sudo installer -pkg ... -target /` โดยตรง; ไม่ปิด Gatekeeper ทั้งระบบ. การแจกจ่ายทั่วไปในองค์กรอาจต้องใช้ Apple Developer ID Installer และ notarization credentials.

## ติดตั้งและตรวจบนเครื่องจริง

Super Admin สร้าง Batch ใน `/admin/system` และเก็บ CSV ครั้งเดียว. บนเครื่อง macOS:

```bash
uname -m
sudo installer -pkg elegant-agent_0.5.0_darwin_$(uname -m).pkg -target /
sudo launchctl print system/com.elegantsolution.agent.machine
launchctl print gui/$(id -u)/com.elegantsolution.agent.session
```

PKG วาง service/UI ใน `/Library/Application Support/ElegantSolution/bin/`, config/API key ใน `/Library/Application Support/ElegantSolution/Agent/` (root-only) และ token เชื่อม UI ใน `/Library/Application Support/ElegantSolution/Bridge/token`. `postinstall` เริ่ม LaunchDaemon และลองเปิด LaunchAgent ใน graphical session ปัจจุบัน; LaunchAgent จะเริ่มเมื่อ login ครั้งถัดไปด้วย. หาก UI ยังไม่เปิด ให้ logout/login หรือเปิด:

```bash
'/Library/Application Support/ElegantSolution/bin/elegant-agent-ui'
```

กรอกรหัสหกหลักหนึ่งรหัสต่อเครื่อง → ตรวจ Admin Tracking online → นักศึกษา login → เปิด app ตัวอย่าง → ดู activity → logout → ตรวจ heartbeat ต่อ → reboot และตรวจ `launchctl`/dashboard อีกครั้ง.

## Privacy, update และปัญหา

การอ่าน foreground app/title ผ่าน `osascript` และ System Events ต้องได้สิทธิ์ **Automation/Accessibility** ใน System Settings → Privacy & Security. ให้สิทธิ์เฉพาะ UI/`osascript` ตาม prompt บนเครื่อง. หากไม่ได้สิทธิ์ Agent ส่ง `null` สำหรับ activity แต่ heartbeat ยังทำงาน; ต้องตรวจจริงก่อนอ้างว่าติดตามชื่อหน้าต่างได้.

ดู log: `/Library/Application Support/ElegantSolution/Agent/logs/ElegantAgent.log` และ `/var/log/elegant-agent-service.err`. Restart หรือ uninstall ต้องมี maintenance code จาก Admin Tracking:

```bash
sudo '/Library/Application Support/ElegantSolution/bin/restart-agent.sh'
sudo '/Library/Application Support/ElegantSolution/bin/uninstall-agent.sh'
```

Update ด้วย PKG เวอร์ชันใหม่ทับ; `Agent/config.json` ไม่อยู่ใน payload และจะคงอยู่. ตรวจ heartbeat หลัง update. หาก backend offline service ลองใหม่ทุก 10 วินาที. หาก LaunchAgent ไม่ขึ้น ตรวจ `launchctl print gui/$(id -u)/com.elegantsolution.agent.session` และเข้า session ใหม่.

มีหลักฐาน build PKG arm64 บนเครื่องพัฒนา แต่ยังไม่ได้ติดตั้งหรือยืนยัน reboot/telemetry บน macOS จริง; Intel package ต้อง build บน Intel runner และตรวจแยก.
