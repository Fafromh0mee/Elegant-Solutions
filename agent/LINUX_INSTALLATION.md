# ติดตั้ง Tracking Agent บน Ubuntu 22.04/24.04 x86-64

**จุดหยุดก่อนสอบ:** ณ 11 พ.ย. 2026 backend จริง `https://elegant.fafromh0me.com` ยังตอบ 404 ที่ `/api/agent/activate`; ต้องอัปเดต backend/migrations และตรวจ route นี้ก่อนใช้รหัสจริง.

Machine component ใช้ systemd service `elegant-agent.service` และเริ่มก่อน graphical login; UI ใช้ XDG autostart เมื่อผู้ใช้ desktop login. DEB 0.5.0 เป็น frozen binary จึงไม่ต้องลง Python บนเครื่องปลายทาง.

## Build บน Ubuntu x86-64

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-tk dpkg-dev
cd agent
ELEGANT_SERVER_URL=https://elegant.fafromh0me.com ./build-linux.sh
sha256sum -c elegant-agent_0.5.0_amd64.deb.sha256
dpkg-deb --contents elegant-agent_0.5.0_amd64.deb
```

## ติดตั้งและทดสอบ

Super Admin สร้าง Batch ใน `/admin/system`, ดาวน์โหลด CSV ครั้งเดียว แล้วแจกหนึ่งรหัสต่อเครื่อง. บน Ubuntu:

```bash
uname -m
sudo apt install ./elegant-agent_0.5.0_amd64.deb
systemctl status elegant-agent.service --no-pager
systemctl is-enabled elegant-agent.service
journalctl -u elegant-agent.service -n 50 --no-pager
```

UI จะเปิดเมื่อเข้า desktop session ครั้งถัดไป. หากต้องทดสอบทันทีใน graphical session:

```bash
/usr/lib/elegant-agent/elegant-agent-ui
```

กรอกรหัสหกหลัก → ตรวจ machine online ใน Admin Tracking → นักศึกษา login → เปิดโปรแกรมตัวอย่าง → ตรวจ activity → logout → ยืนยัน heartbeat ยังออนไลน์ → reboot แล้วตรวจ `systemctl`/dashboard อีกครั้งโดยไม่ activate ซ้ำ.

Config/API key อยู่ที่ `/var/lib/elegant-agent/config.json` เฉพาะ system user `elegant-agent`; token เชื่อม UI อยู่ `/run/elegant-agent/token`. Log อยู่ `/var/lib/elegant-agent/logs/ElegantAgent.log`. X11 อาจอ่าน foreground app/title ได้หาก desktop ให้ EWMH; Wayland ส่ง `null` โดยไม่แต่งข้อมูล แต่ machine heartbeat และ login ยังทำงาน.

## บำรุงรักษาและปัญหา

```bash
sudo elegant-agent-restart
sudo elegant-agent-uninstall
```

ทั้งสองคำสั่งถาม maintenance code ตาม action. Update ด้วย `sudo apt install ./<new-version>.deb`; config ใน `/var/lib/elegant-agent` คงอยู่. หากย้ายจาก Agent Linux แบบ user-level เดิม ให้สำรอง `~/.config/elegant-solution/agent/config.json` อย่างปลอดภัยก่อน แล้วรัน `sudo elegant-agent-migrate-legacy <desktop-username>` หลังติดตั้ง DEB. Script คัดลอก config ไปที่ service account เฉพาะเมื่อปลายทางยังไม่มี, เก็บต้นฉบับไว้ และปิด XDG autostart เดิมด้วยการเปลี่ยนชื่อไฟล์; logout/login ก่อนใช้ UI ใหม่. อย่าใช้ activation code เดิมซ้ำ.

หาก service offline ให้ตรวจ URL ใน `/usr/lib/elegant-agent/deployment.json`, backend HTTPS, DNS, firewall และ journal. หาก UI แจ้ง service ไม่พร้อม ตรวจ `systemctl status`; ถ้า desktop ใช้ Wayland ให้คาดว่า window title ไม่พร้อมและอย่านำไปสาธิตเป็นข้อมูลจริง.

DEB build ใน Linux container/CI ไม่เท่ากับติดตั้งบน Ubuntu จริง; ต้องตรวจขั้นตอนนี้บนเครื่อง Ubuntu ก่อนสอบ.
