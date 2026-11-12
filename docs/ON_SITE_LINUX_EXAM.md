# Elegant Solution 0.5.0 — ติดตั้งบน Linux เครื่องใหม่เพื่อสอบปฏิบัติ

เอกสารนี้ใช้กับ branch `docs/on-site-linux-exam-runbook` ซึ่งต่อจาก `feature/cross-platform-tracking-agent-exam` ไม่ใช่ `main` เก่า คำสั่งทั้งหมดด้านล่าง **มีไว้ให้รันบนเครื่องบริษัทหลังได้รับอนุญาต**; การจัดทำเอกสารนี้ไม่ได้เชื่อมต่อหรือแก้เครื่องบริษัทหรือ production เดิม ต้องใช้บัญชีและข้อมูลทดสอบใหม่เท่านั้น

**ทางที่ตรวจสอบจากซอร์ส:** `docker-compose.pilot.yml` ใช้ PostgreSQL 16, Web, Face AI แบบ CPU, ฐานข้อมูล/AI อยู่ใน Compose network และ Web เปิดเพียง `127.0.0.1:3000`; `web/start.sh` รัน `prisma migrate deploy` ก่อน Next.js; service ทั้งสามใช้ `restart: unless-stopped` ส่วน DEB 0.5.0 รองรับ Ubuntu 22.04/24.04 `amd64` ตามเอกสาร Agent. การตรวจ Compose syntax และ lockfile ผ่านในเครื่องพัฒนา แต่ยังไม่ได้ build image หรือทดสอบบน Linux เครื่องบริษัท

**จุดหยุด:** ถ้า OS/architecture ไม่ตรง, Docker daemon ใช้ไม่ได้, หน่วยความจำ/ดิสก์ไม่พอ, ไม่มี HTTPS URL ที่เครื่อง Agent เข้าถึงได้, หรือไม่มีสิทธิ์จัดการ server ให้หยุดที่ phase ที่เกี่ยวข้องและถามผู้คุมสอบก่อน ห้ามใช้ `https://elegant.fafromh0me.com` ซึ่งเป็น backend เก่า ห้ามใช้ `web/prisma/seed.ts` เพราะเป็น demo seed ที่สร้างบัญชี/รหัสผ่านตัวอย่าง ห้ามใช้ `docker compose down -v`, `prisma migrate reset` หรือ `db push --accept-data-loss`

ใช้ตัวแปร `BACKEND_URL` เป็น URL ใหม่ เช่น `https://exam.example.org` ต้องไม่มี path หรือ `/` ท้าย URL และมีใบรับรอง TLS ที่เครื่อง Agent เชื่อถือได้ ถ้าไม่มี DNS/HTTPS จริง สามารถสาธิต Web ในเครื่องผ่าน `http://127.0.0.1:3000` ก่อน แต่ **ยังไม่ผ่านเกณฑ์ Agent จากเครื่องอื่น**; ห้าม build Agent ด้วย URL เก่า

## Phase A — Host Preflight

**อ่านอย่างเดียว; ไม่ต้อง sudo** ยกเว้นการตรวจสิทธิ์ `sudo -n true` ซึ่งไม่เปลี่ยนระบบ รันบน server หลังรับ SSH user/IP จากบริษัท:

```bash
cat /etc/os-release | head -8
uname -m
nproc
free -h
df -h . /var/lib/docker 2>/dev/null || df -h .
command -v docker && docker --version && docker compose version && docker info --format '{{.ServerVersion}}'
id; sudo -n true && echo SUDO_OK || echo SUDO_REQUIRES_PASSWORD_OR_UNAVAILABLE
ss -ltn | grep -E ':(22|80|443|3000) ' || true
systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || true
printf 'DISPLAY=%s WAYLAND_DISPLAY=%s\n' "${DISPLAY:-}" "${WAYLAND_DISPLAY:-}"
command -v loginctl && loginctl list-sessions || true
curl -I --max-time 10 https://registry-1.docker.io/v2/ || true
curl -I --max-time 10 https://github.com/ || true
```

จากเครื่องที่ใช้ควบคุม ตรวจ SSH ด้วย `ssh -o ConnectTimeout=8 USER@SERVER_IP 'hostname; id; pwd'` หลังได้รายละเอียดจริง **อ่านอย่างเดียว; ไม่ต้อง sudo**. Docker registry ตอบ `401 Unauthorized` ที่ `/v2/` ได้และยังถือว่าเครือข่ายถึงปลายทาง. ตรวจว่า `amd64/x86_64`, Ubuntu 22.04/24.04 สำหรับ DEB; CPU/RAM/ดิสก์เพียงพอสำหรับ Next build + InsightFace (แนะนำอย่างน้อย 8 GiB RAM และ 15 GiB ดิสก์ว่างสำหรับ build ในเครื่อง); Docker/Compose ใช้งานได้; พอร์ต 80/443 ว่างสำหรับ proxy และ 3000 ว่างสำหรับ Web. ถ้าเป็น distro/architecture อื่น Compose อาจใช้ได้แต่ Face AI wheel และ DEB ยังไม่ผ่านการยืนยัน: อย่าฝืนติดตั้ง DEB. ถ้า `docker info` ถูกปฏิเสธ ให้ตรวจ `sudo docker info` แบบอ่านอย่างเดียวแล้วใช้ `sudo docker` ใน phase ต่อไป. ถ้าไม่มี desktop ให้ใช้ขั้น headless ใน Phase G/H.

## Phase B — Repository Preparation

**เปลี่ยนระบบ: clone และสร้างไฟล์ config; ไม่ต้อง sudo**. ต้องมี HTTPS domain ที่ DNS ชี้มายัง server, พอร์ต 80/443 จาก client เข้าได้ และผู้ดูแล DNS อนุญาต. ถ้า repo private ให้ใช้ Git credential ที่ได้รับอนุญาต. รันในโฟลเดอร์ที่ผู้ใช้เขียนได้:

```bash
cd "$HOME"
git clone --branch docs/on-site-linux-exam-runbook --single-branch https://github.com/Fafromh0mee/Elegant-Solutions.git Elegant-Solutions
cd Elegant-Solutions
git status --short --branch
git rev-parse HEAD
umask 077
read -r -p 'Backend URL ใหม่ (https://...): ' BACKEND_URL
export BACKEND_URL
python3 - <<'PY'
import os, pathlib, secrets, urllib.parse
url = os.environ['BACKEND_URL'].rstrip('/')
parsed = urllib.parse.urlparse(url)
if parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query or parsed.fragment:
    raise SystemExit('ต้องใช้ HTTPS origin ใหม่เท่านั้น')
if parsed.hostname == 'elegant.fafromh0me.com':
    raise SystemExit('ห้ามใช้ production backend เก่า')
text = pathlib.Path('.env.pilot.example').read_text()
text = text.replace('replace_with_a_long_url_safe_password', secrets.token_hex(32))
text = text.replace('replace_with_a_long_random_auth_secret', secrets.token_hex(32))
text = text.replace('https://pilot.example.com', url)
text = text.replace('replace_with_google_client_id', '').replace('replace_with_google_client_secret', '')
path = pathlib.Path('.env.pilot')
with path.open('x') as f:
    f.write(text)
path.chmod(0o600)
PY
mkdir -p agent/installers
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml config --quiet
```

**ผ่าน:** `git status` ไม่มีไฟล์ที่แก้, HEAD ตรง commit ในรายงาน, `.env.pilot` mode 600, Compose config จบ exit 0. `config --quiet` ไม่พิมพ์ secret; ห้ามใช้ `docker compose config` แบบไม่ quiet ในที่สาธารณะ. ถ้า `docker` ใช้ได้โดยไม่ต้อง sudo สามารถตัด `sudo` ออกทุกคำสั่ง Compose. `.env.pilot` ถูก `.gitignore` และต้องไม่ commit หรือส่งให้ผู้อื่น. คำสั่ง Python ปฏิเสธการเขียนทับไฟล์ env เดิม.

## Phase C — Docker Compose Backend และ HTTPS

**เปลี่ยนระบบ: build/start containers; ใช้ sudo สำหรับ Docker**. บนเครื่อง RAM ต่ำให้ปิดงานหนักอื่นและ build ทีละ image. Face AI ต้องดาวน์โหลด model ระหว่าง build; ต้องมีอินเทอร์เน็ตและพื้นที่ว่างหลาย GB. อย่าเปิดพอร์ตฐานข้อมูลหรือ AI ต่อภายนอก.

```bash
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml build face-ai
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml build web
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml up -d postgres face-ai
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml ps
```

**ผ่าน:** build exit 0, `postgres` healthy, `face-ai` เปลี่ยนเป็น healthy เมื่อ model โหลดเสร็จ. ถ้า build ถูก kill ให้ดู `free -h`, `df -h`, `sudo docker system df` ก่อนจัดการพื้นที่; อย่าลบ volume. ถ้า Face AI build ล้มจาก wheel/architecture ให้หยุดและระบุ OS/arch กับ error. ตรวจ log แบบไม่พิมพ์ environment: `sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml logs --tail=80 face-ai`.

**HTTPS:** ตัวอย่าง config มีที่ `deploy/nginx/pilot.conf.example`. บน Ubuntu 22.04/24.04 ที่มี public DNS และสิทธิ์ apt ให้ติดตั้ง Nginx/Certbot ดังนี้ (**เปลี่ยนระบบ; sudo**). ถ้าบริษัทมี reverse proxy/TLS อยู่แล้ว ให้ผู้ดูแลตั้ง proxy ไป `127.0.0.1:3000` และข้ามคำสั่งติดตั้ง proxy; อย่าทับ config ของบริษัท.

```bash
BACKEND_HOST=$(python3 -c 'import os,urllib.parse; print(urllib.parse.urlparse(os.environ["BACKEND_URL"]).hostname)')
getent ahostsv4 "$BACKEND_HOST"
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/elegant-exam >/dev/null <<EOF
server {
    listen 80;
    server_name ${BACKEND_HOST};
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/elegant-exam /etc/nginx/sites-enabled/elegant-exam
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d "$BACKEND_HOST" --redirect
curl -fsS "$BACKEND_URL/api/liveness"
```

**ผ่าน:** DNS ชี้ host นี้, `nginx -t` สำเร็จ, Certbot ได้ certificate, `curl` ได้ `{"status":"ok"}` หลัง Phase D เริ่ม Web. ก่อน Web เริ่ม `curl` อาจได้ 502 ซึ่งคาดได้. ถ้า certificate ออกไม่ได้ ให้ตรวจ DNS, NAT/firewall 80/443 และเวลาของเครื่อง; **ห้ามติดตั้ง Agent ด้วย URL ที่ TLS ไม่ถูกต้อง**. ถ้า symlink/config มีอยู่แล้ว หยุดตรวจของเดิมก่อนแก้.

## Phase D — Database Migration และ Web

**เปลี่ยนฐานข้อมูลใหม่และเริ่ม Web; sudo สำหรับ Docker**. Compose ใช้ PostgreSQL 16 ใน named volume; ห้ามใช้ production dump. รัน migrate อย่างชัดเจนก่อนเริ่ม Web; `web/start.sh` จะรันซ้ำแบบ idempotent เมื่อ Web เริ่ม:

```bash
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml exec -T postgres pg_isready -U elegant -d elegant_solutions
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml run --rm --no-deps --entrypoint sh web -c 'prisma migrate deploy --config ./prisma.runtime.config.ts'
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml run --rm --no-deps --entrypoint sh web -c 'prisma migrate status --config ./prisma.runtime.config.ts'
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml up -d web
bash scripts/pilot-check.sh
curl -fsS "$BACKEND_URL/api/liveness"
```

**ผ่าน:** migration จบโดยไม่มี `P3018`/missing table; status รายงาน up to date; pilot-check Web/DB/Face AI ผ่าน; HTTPS liveness เป็น 200. `prisma migrate status` เป็นคำสั่งอ่านอย่างเดียว ส่วน `migrate deploy` เขียน schema. ถ้าฐานข้อมูลยังไม่ healthy ให้ดู `sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml logs --tail=80 postgres`; ถ้า migration ผิดพลาดให้หยุด ไม่ reset DB. ถ้า Web crash ดู log `... logs --tail=80 web`. `bash scripts/pilot-check.sh` ไม่เปลี่ยนข้อมูล.

## Phase E — บัญชีแรกและห้องทดสอบ

**เปลี่ยนฐานข้อมูลใหม่; ไม่ใช้ sudo ใน browser, ใช้ sudo สำหรับ Docker**. เปิด `$BACKEND_URL/register` สร้างบัญชีทดสอบของผู้คุมสอบด้วยรหัสผ่านใหม่ที่ไม่เคยใช้จริง. ระบบสมัครเป็น `GUEST/PENDING` จึงต้องเลื่อนสิทธิ์บัญชีแรกเพียงหนึ่งรายการ. คำสั่งนี้ตั้งใจให้ใช้เฉพาะฐานข้อมูลใหม่ที่มี user **หนึ่งคน**; ถ้าเคยสร้างผู้ใช้อื่นแล้วจะ abort/rollback. ไม่ใส่รหัสผ่านใน shell command:

```bash
read -r -p 'อีเมลบัญชีแรกที่สมัครแล้ว: ' ADMIN_EMAIL
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml exec -T postgres \
  psql -X -v ON_ERROR_STOP=1 -v email="$ADMIN_EMAIL" -U elegant -d elegant_solutions <<'SQL'
BEGIN;
SELECT set_config('app.bootstrap_email', :'email', true) \gset
DO $$
DECLARE changed integer;
BEGIN
  IF (SELECT count(*) FROM users) <> 1 THEN
    RAISE EXCEPTION 'bootstrap ต้องมี user เพียงหนึ่งคน';
  END IF;
  UPDATE users SET role = 'SUPER_ADMIN'::"Role", status = 'APPROVED'::"AccountStatus", "updatedAt" = now()
    WHERE email = current_setting('app.bootstrap_email') AND role = 'GUEST' AND status = 'PENDING';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'bootstrap ต้องแก้ user ได้หนึ่งคน'; END IF;
END $$;
COMMIT;
SQL
```

**ผ่าน:** `DO` และ `COMMIT` exit 0; login ที่ `$BACKEND_URL/login` สำเร็จและเปิด `/admin/system`, `/admin/rooms`, `/admin/tracking`, `/admin/diagnostics` ได้. ถ้า exception อย่าปรับ SQL แบบเดา ให้ตรวจจำนวนบัญชีด้วย `SELECT count(*) FROM users;` ซึ่งไม่เผยข้อมูลส่วนบุคคล. ใน `/admin/rooms` สร้างห้องทดสอบใหม่ (เช่น code `EXAM-LAB-01`, ชื่อและจำนวนที่นั่งตามสถานที่); ตรวจห้อง active. ใน `/admin/users` สร้าง/อนุมัติ test student ด้วยรหัสผ่านใหม่ (หรือใช้ Google OAuth เฉพาะเมื่อ configured จริง). ใน `/admin/system` เลือกห้องนี้ สร้าง Batch จำนวน 1 และดาวน์โหลด CSV **ครั้งเดียว**; รหัสหกหลักใช้ครั้งเดียว ภายในเจ็ดวัน เก็บ CSV ส่วนตัว ไม่ส่งลง Git. ถ้า student Agent login ต้องมีสิทธิ์ใช้ห้องตามกฎ booking/class/room access ของระบบ; ตั้ง booking/permission ทดสอบผ่าน UI ก่อน Phase H.

## Phase F — สร้างและติดตั้ง Linux Tracking Agent

**เปลี่ยนระบบ: build DEB และ apt install; sudo เฉพาะ apt**. ทำบน Ubuntu 22.04/24.04 `x86_64` เท่านั้น. DEB ที่เคย build ไว้ชี้ production เก่า; **ห้ามนำมาติดตั้ง**. `ELEGANT_SERVER_URL` จะถูกเขียนลง `deployment.json` ใน DEB ตอน build จึงต้อง build ใหม่ด้วย URL บริษัท. ใน shell เดิมยังมี `BACKEND_URL` จาก Phase B:

```bash
test "$(uname -m)" = x86_64
curl -fsS "$BACKEND_URL/api/liveness"
sudo apt-get install -y python3 python3-venv python3-tk dpkg-dev
cd agent
ELEGANT_SERVER_URL="$BACKEND_URL" bash ./build-linux.sh
sha256sum -c elegant-agent_0.5.0_amd64.deb.sha256
dpkg-deb -f elegant-agent_0.5.0_amd64.deb Architecture Version
dpkg-deb --fsys-tarfile elegant-agent_0.5.0_amd64.deb | tar -xOf - ./usr/lib/elegant-agent/deployment.json | python3 -c 'import json,os,sys; u=json.load(sys.stdin)["server_url"]; sys.exit(0 if u == os.environ["BACKEND_URL"].rstrip("/") and u != "https://elegant.fafromh0me.com" else 1)'
cp elegant-agent_0.5.0_amd64.deb ../agent/installers/
sudo apt install ./elegant-agent_0.5.0_amd64.deb
systemctl is-enabled elegant-agent.service
systemctl is-active elegant-agent.service
```

**ผ่าน:** package `amd64`, `0.5.0`; SHA-256 ผ่าน; URL ภายในตรง URL ใหม่; service enabled/active. Build ใช้ Python/PyInstaller และอาจใช้เวลา. ถ้า `tar` หา member ไม่เจอ ให้ตรวจ `dpkg-deb --contents` แล้วอย่าติดตั้งจนยืนยัน URL ได้. ถ้า apt dependency ล้ม ให้ตรวจ `sudo journalctl -u elegant-agent.service -n 60 --no-pager` และ `systemctl status`; ห้ามเปลี่ยนไปใช้แพ็กเกจเก่า. Installer download ใน Web จะพร้อมหลังวางไฟล์ใน `agent/installers` เพราะ Compose mount แบบ read-only.

## Phase G — Activation และ machine heartbeat

**เปลี่ยนข้อมูล Agent/DB; ไม่ต้อง sudo สำหรับ UI หรือ bridge, sudo สำหรับ journal**. บน desktop login แล้ว XDG autostart จะเปิด UI; เปิดเองได้ด้วย `/usr/lib/elegant-agent/elegant-agent-ui`. กรอกรหัสจาก CSV ของห้องทดสอบ. บน headless host ใช้ loopback bridge ที่ Agent มีอยู่ โดย **อย่าพิมพ์ token หรือ activation code ลง log/ประวัติคำสั่ง**:

```bash
read -r -s -p 'Activation code 6 หลัก: ' AGENT_CODE; echo
AGENT_CODE="$AGENT_CODE" python3 - <<'PY'
import json,os,urllib.request
token=open('/run/elegant-agent/token',encoding='ascii').read().strip()
req=urllib.request.Request('http://127.0.0.1:18767/activate',
    data=json.dumps({'code':os.environ['AGENT_CODE']}).encode(),
    headers={'X-Local-Agent-Token':token,'Content-Type':'application/json'},method='POST')
with urllib.request.urlopen(req,timeout=15) as r:
    d=json.load(r)
print('activated=', d.get('ok'), 'machineCode=', d.get('machineCode'), 'roomCode=', d.get('roomCode'))
PY
unset AGENT_CODE
```

Bridge ใช้ `127.0.0.1:18767` และ token ใน `/run/elegant-agent/token`; คำสั่งข้างบนต้องรันบน **host ที่ติดตั้ง Agent** ไม่ใช่ใน container. ถ้า error ให้ตรวจ URL ใน `/usr/lib/elegant-agent/deployment.json` (ไม่มี secret), DNS/TLS และ `sudo journalctl -u elegant-agent.service -n 60 --no-pager`. จากนั้นดู `/admin/tracking`: เครื่องที่จับคู่กับห้องเดิม Online โดยไม่ต้องให้นักศึกษา login และไม่มีรายการซ้ำ. ขอดู `/status` ผ่าน UI หรือ bridge; ห้ามอ่าน/แสดง `/var/lib/elegant-agent/config.json` เพราะมี API key. **ผ่าน:** activation ตอบ `activated=True`, machine code/room code ตรง Batch และ Admin Tracking Online ภายในประมาณ 30 วินาที; ถ้าไม่ผ่านให้หยุดก่อนใช้รหัสใหม่.

## Phase H — Student Login และ Activity

**เปลี่ยน session/log ทดสอบ; ไม่ต้อง sudo**. บน Linux desktop รัน:

```bash
/usr/lib/elegant-agent/elegant-agent-ui
xdg-open "$BACKEND_URL/admin/tracking"
```

Login Agent UI ด้วยบัญชี test student ที่มีสิทธิ์ห้อง, เปิดแอปทดสอบ, ดู `/admin/tracking` และ `/api/tracking/snapshot` ผ่าน browser admin, logout แล้วตรวจว่าเครื่องยัง Online. **ผ่าน:** dashboard มี machine code เดิมและ activity เฉพาะช่วง login; logout แล้ว machine ยัง Online. ถ้า login ไม่ได้ ให้ตรวจบัญชี `APPROVED` และสิทธิ์ใช้ห้องก่อนดู journal โดยไม่พิมพ์รหัสผ่าน. X11 อาจส่งชื่อ app/window ได้; Wayland อาจส่ง `null` ตามโค้ด Agent ปัจจุบัน. **Headless ไม่มี foreground window**: สาธิต machine heartbeat บน server ที่ Phase G และใช้ Ubuntu desktop `amd64` แยกอีกเครื่องที่ลง DEB ซึ่ง build ด้วย URL บริษัท สร้าง Batch/code อีกชุดสำหรับเครื่อง desktop แล้วทดสอบ activity ที่นั่น. ไม่อ้างว่า headless host จับกิจกรรมหน้าจอได้.

## Phase I — Reboot และ Recovery

**เปลี่ยนระบบ: reboot; sudo ต้องได้รับอนุญาตผู้คุมสอบ**. ก่อน reboot บันทึก machine code และตรวจ `/admin/tracking` Online. จากนั้น:

```bash
sudo systemctl reboot
# ต่อ SSH กลับเข้ามาหลังเครื่องบูต
cd ~/Elegant-Solutions
BACKEND_URL=$(sed -n 's/^AUTH_URL=//p' .env.pilot)
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml ps
systemctl is-enabled elegant-agent.service
systemctl is-active elegant-agent.service
bash scripts/pilot-check.sh
curl -fsS "$BACKEND_URL/api/liveness"
```

**ผ่าน:** service กลับมาเอง, machine code เดิม Online โดยไม่ activate ซ้ำ, ไม่มี duplicate, Web/DB/Face AI healthy, student session เริ่มใหม่ได้. ถ้าไม่ผ่านให้ดู `sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml logs --tail=80 web face-ai postgres` และ `sudo journalctl -u elegant-agent.service -b -n 80 --no-pager`; อย่า reset DB หรือสร้าง code ใหม่ก่อนรู้สาเหตุ.

## Phase J — Uninstallation และ Cleanup

**เปลี่ยนระบบและข้อมูลทดสอบ; ขออนุญาตผู้คุมสอบก่อน**. ถอน Agent ด้วย maintenance code สำหรับ `UNINSTALL_AGENT` จาก `/admin/system` ตาม UI; ไม่แสดง code ในเอกสาร:

```bash
sudo elegant-agent-uninstall
systemctl is-active elegant-agent.service || true
dpkg-query -W elegant-agent || true
```

**ผ่าน:** package/service ถูกถอน; ตรวจว่า machine record ใน Admin Tracking อาจยังเป็นข้อมูลประวัติ (ไม่เท่ากับรายการซ้ำ). ถ้าต้องหยุด backend โดย **เก็บฐานข้อมูล**:

```bash
sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml stop
```

การลบ container แบบคง volume ใช้ `sudo docker compose --env-file .env.pilot -f docker-compose.pilot.yml down`; **ห้าม** เติม `-v` โดยไม่อนุมัติการทำลายข้อมูล. ถ้าบริษัทต้องการเก็บระบบให้ใช้งานต่อ ไม่ต้องรัน Phase J. การลบ DNS, certificate, Nginx config และ database volume เป็นงานผู้ดูแลเครื่องหลังสอบ ไม่รวมในคำสั่งอัตโนมัติ.

## ข้อจำกัดที่ต้องยืนยันหน้างาน

- Docker daemon ในเครื่องพัฒนาไม่พร้อม จึงยังไม่มี Docker image build หรือการติดตั้ง DEB จริงบน Linux จาก runbook นี้. `pnpm@11.20.0` ใน `web/Dockerfile` รองรับ Node `22.13` และตรวจ `pnpm-lock.yaml` แบบ frozen ผ่านแล้ว; ไม่จำเป็นต้องเปลี่ยนเป็น pnpm 9 เพียงเพราะ PM2 production ใช้ pnpm 9.15.9.
- ต้องยืนยัน HTTPS domain ที่เข้าถึงจาก server และ desktop client, DNS/ไฟร์วอลล์, OS/CPU/RAM/disk, สิทธิ์ sudo/Docker และ desktop session ก่อนเลือกขั้น Agent.
- ข้อมูล Face AI ใช้ model download ระหว่าง build; ต้องทดสอบกล้องจริง/HTTPS/สิทธิ์ห้องจริงหน้างาน. การผ่าน unit test หรือ build ไม่ยืนยันการสาธิตบนฮาร์ดแวร์จริง.
