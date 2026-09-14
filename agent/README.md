# Elegant Solutions — Tracking Agent

Python agent ที่รันบน Windows เพื่อติดตามการใช้งานคอมพิวเตอร์ในห้องเรียน
และรายงานข้อมูลแบบ real-time ไปยัง Admin Dashboard

## โครงสร้างไฟล์

```
agent/
├── src/
│   ├── main.py          # Entry point, tray icon, orchestration
│   ├── monitor.py       # ดึง active process + window title
│   ├── auth_dialog.py   # Login dialog (tkinter) + Setup wizard
│   ├── blocker.py       # บล็อกเว็บผ่าน hosts file
│   ├── notifier.py      # Windows toast notifications
│   ├── api_client.py    # HTTP client สำหรับติดต่อ web server
│   └── config.py        # อ่าน/เขียน config.json
├── requirements.txt
├── build.bat            # Compile เป็น .exe ด้วย PyInstaller
└── setup.bat            # ลงทะเบียน Task Scheduler (run as Admin)
```

## การติดตั้ง (Development)

```bash
pip install -r requirements.txt
cd src
python main.py
```

## การ Build เป็น .exe

```bat
build.bat
# ได้ไฟล์: dist\ElegantAgent.exe
```

## การ Deploy บน Windows

1. Copy `dist\ElegantAgent.exe` ไปวางในเครื่อง
2. รัน `setup.bat` ในฐานะ Administrator
3. Agent จะ start อัตโนมัติทุกครั้งที่ login

## Setup ครั้งแรก

เมื่อรัน agent ครั้งแรกบนเครื่องใหม่ จะมี wizard ขึ้นมาให้กรอก:
- **URL ของเซิร์ฟเวอร์** — เช่น `https://elegant.yourdomain.com`
- **รหัสเครื่อง** — เช่น `LAB-A101-PC01`
- **รหัสห้อง** — เช่น `A101` (optional)
- **Register Secret** — ขอจาก Admin (ตั้งใน `AGENT_REGISTER_SECRET` env var)

## Web Server — env vars ที่ต้องมี

```env
AGENT_REGISTER_SECRET="your-strong-secret"
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agent/register` | ลงทะเบียนเครื่องใหม่ |
| POST | `/api/agent/auth` | ตรวจสอบ login ของ user |
| POST | `/api/agent/heartbeat` | ส่งข้อมูล activity ทุก 10s |
| GET | `/api/agent/config` | ดึง blacklist + session info |
| GET | `/api/tracking/snapshot` | ดึงข้อมูลทั้งหมดสำหรับ dashboard |

## Features

- **Login** — ใช้ email/password เดียวกับระบบเว็บ
- **Monitor** — ติดตาม active app + window title ทุก 10 วินาที
- **Risk Detection** — เปรียบเทียบกับ blacklist และ keyword patterns
- **Website Blocker** — แก้ hosts file เพื่อบล็อก domain ที่อยู่ใน blacklist
- **Notifications** — แจ้งเตือนก่อนหมดเวลา 10 นาที และ 2 นาที
- **System Tray** — icon ใน notification area พร้อม logout / status
- **Auto-start** — ผ่าน Windows Task Scheduler
