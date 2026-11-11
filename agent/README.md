# Elegant Solution Tracking Agent 0.5.0

Tracking Agent ใช้ Python core เดียวกันบน Windows, macOS และ Ubuntu โดยแยก `machine_service.py` ออกจาก `session_ui.py`. Machine service ส่ง heartbeat ทุก 10 วินาทีโดยไม่ต้องมีนักศึกษา login; desktop UI เก็บข้อมูลหน้าต่างเฉพาะช่วงที่มี Agent session. UI ติดต่อ service ผ่าน HTTP loopback `127.0.0.1:18767` โดยใช้ token ภายในเครื่อง. Machine API key อยู่ในพื้นที่ข้อมูลของ service.

| OS | เครื่อง build | installer | service | UI startup |
| --- | --- | --- | --- | --- |
| Windows 10/11 x64 | Windows + Python 3.12 + Inno Setup 6 | `release/ElegantAgentSetup_0.5.0_x64.exe` | `ElegantSolutionsMachine` | `HKLM\...\Run` |
| macOS arm64/x86_64 | macOS ตาม architecture + Python 3.12 | `elegant-agent_0.5.0_darwin_<arch>.pkg` | LaunchDaemon | LaunchAgent |
| Ubuntu 22.04/24.04 x86-64 | Ubuntu x86-64 + Python 3 + `dpkg-deb` | `elegant-agent_0.5.0_amd64.deb` | `elegant-agent.service` | XDG autostart |

ตั้ง `ELEGANT_SERVER_URL` เป็น URL HTTPS ของ backend ก่อน build แต่ละ platform. Installer เก็บเพียง URL นี้ใน `deployment.json` และไม่รวม API key หรือ activation code.

```bat
set ELEGANT_SERVER_URL=https://pilot.example.com
build.bat
```

```bash
ELEGANT_SERVER_URL=https://pilot.example.com ./build-macos.sh
ELEGANT_SERVER_URL=https://pilot.example.com ./build-linux.sh
```

รหัสใหม่จาก **Admin → System → Tracking Agent Deployment** ใช้ได้ครั้งเดียวภายใน 7 วัน; รหัสแบบเดิมจาก Admin Tracking ยังหมดอายุใน 10 นาที. หลัง activation สำเร็จ service เก็บ machine identity และ API key เพื่อกลับมาทำงานหลัง reboot โดยไม่ต้องเปิดใช้งานใหม่.

อ่านขั้นตอนจริงใน [WINDOWS_INSTALLATION.md](WINDOWS_INSTALLATION.md), [MACOS_INSTALLATION.md](MACOS_INSTALLATION.md), [LINUX_INSTALLATION.md](LINUX_INSTALLATION.md), [EXAM_CHEAT_SHEET.md](EXAM_CHEAT_SHEET.md) และ [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

แพ็กเกจ macOS ปัจจุบันเป็น development package ที่ยังไม่ signed/notarized จนกว่าจะมี Apple Developer ID และ notarization credentials. CI สร้าง artifacts เท่านั้นและไม่เผยแพร่ release. Legacy `main.py`, `install.sh` และ `uninstall.sh` ยังอยู่เพื่อการอ้างอิง/ติดตั้งเก่า; installer 0.5.0 ใช้ไฟล์และบริการที่ระบุด้านบน.
