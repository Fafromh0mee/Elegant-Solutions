# เตรียมอัปเดต backend 0.5.0 บนเซิร์ฟเวอร์ PM2

เอกสารนี้เป็นขั้นตอนสำหรับ **หลังได้รับอนุมัติ deploy เท่านั้น**. ยังไม่มีคำสั่งใดในเอกสารนี้ถูกรันบน production ระหว่างการเตรียมงาน. เซิร์ฟเวอร์ที่ตรวจแล้วคือ `lamy@103.216.158.221`, Ubuntu 20.04.6, แอป PM2 ชื่อ `elegant` จาก `/home/lamy/Elegant-Solutions/web`, Nginx ส่งต่อไป `localhost:3000`, PostgreSQL 16 อยู่ใน Docker container `elegant-postgres`, และ URL สาธารณะคือ `https://elegant.fafromh0me.com`.

รันบล็อกคำสั่งฝั่งเซิร์ฟเวอร์ใน SSH shell เดียวกันตามลำดับ เพื่อให้ `DEPLOY_SHA` และ `RELEASE` ที่ตั้งในข้อ 3 ยังอยู่. หาก reconnect ให้ตั้ง `RELEASE=/home/lamy/elegant-releases/<approved-full-commit-sha>` ก่อนทำต่อ. บล็อก `scp` ในข้อ 4 รันบน Mac อีกหน้าต่างหนึ่ง.

## หลักฐานที่ต้องผ่านก่อนอนุมัติ

- Branch สำหรับ release ต้องมี `20260514051539_idk/migration.sql` ที่ SHA-256 เท่ากับ `b8f9b525a16c5f23af233390111e7570938ff42c25f5c10e4114dd73cc21da75`. นี่คือ migration หมายเลข 10 ที่ production ใช้แล้ว; ห้ามเขียนทับ.
- การซ้อมบน PostgreSQL 16: ฐานข้อมูลใหม่ใช้ครบ 17 migrations และ backup production ที่ restore ใช้ 10 รายการเดิมตามด้วย 7 รายการใหม่. `prisma migrate diff` ต้องไม่มีความต่างกับ `schema.prisma`; user/session/room/Agent machine ต้องคงจำนวนและชุด ID.
- ตรวจ Node.js ที่เซิร์ฟเวอร์ให้รองรับทั้ง Next.js 16 และ Prisma 7.3 (`^20.19`, `^22.12` หรือ `>=24` ตาม `engines.node` ที่ติดตั้ง), `pnpm`, PM2, พื้นที่ดิสก์ และ **แหล่งของ runtime environment**. คำสั่งด้านล่างใช้ไฟล์ `.env` ของ deployment เดิม; หาก secrets อยู่เฉพาะใน PM2 environment ให้หยุดและออกแบบวิธีส่งต่อ env ก่อน.
- ตรวจว่าผู้ดูแลยังมี backup ใหม่ที่อ่านได้ พร้อม SHA-256 และทราบวิธีกู้คืน. ไม่พิมพ์ค่า secret, ข้อมูลผู้ใช้ หรือเนื้อหา backup.
- Production checkout เดิมไม่สะอาด (`web/pnpm-lock.yaml` เปลี่ยน, มีไฟล์ untracked). คำสั่งด้านล่างใช้ Git worktree ใหม่และไม่แก้ checkout เดิม.

## 1. Preflight แบบอ่านอย่างเดียวบนเซิร์ฟเวอร์

```bash
ssh lamy@103.216.158.221
set -euo pipefail
OLD=/home/lamy/Elegant-Solutions
test "$(id -un)" = lamy
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(!((a===20&&b>=19)||(a===22&&b>=12)||a>=24)) process.exit(1)'
node --version
pnpm --version
pm2 --version
pm2 describe elegant
df -h /home/lamy
git -C "$OLD" status --short
find "$OLD/web" -maxdepth 1 -type f -name '.env*' -printf '%f\n'
docker exec elegant-postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

ตรวจด้วยผู้ดูแลว่า `.env` ของเว็บเดิมมี `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` และตัวแปรที่แอปจริงต้องใช้ โดยดู **ชื่อ** เท่านั้น. หากไม่พบ `.env` หรือ PM2 มี secret ที่ไม่ได้อยู่ในไฟล์เหล่านี้ ให้หยุดก่อนขั้นตอนต่อไป. ห้ามนำตัวอย่าง `.env.pilot.example` ไปแทนค่า production.

## 2. สร้าง backup ใหม่และตรวจ archive

ทำใน shell ของ `lamy` บนเซิร์ฟเวอร์หลังได้รับอนุมัติ. คำสั่งนี้ไม่แตะ container `ezdn_postgres`.

```bash
set -euo pipefail
BACKUP_DIR=/home/lamy/elegant-db-backups
install -d -m 700 "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/elegant_solutions_$(date +%Y%m%d_%H%M%S)_pre_v050.dump"
umask 077
docker exec elegant-postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP"
pg_restore --list "$BACKUP" >/dev/null
sha256sum "$BACKUP"
stat -c '%n %s bytes' "$BACKUP"
```

จด path และ checksum ในบันทึกการ deploy ที่เข้าถึงได้เฉพาะผู้ดูแล. `pg_restore --list` พิสูจน์ว่า archive อ่านได้; การ restore สำเนาเป็นหลักฐานเพิ่มเติมที่ต้องมีจากการซ้อมก่อนหน้า.

## 3. เตรียม release แยกจาก production checkout

รับ **full commit SHA ที่อนุมัติแล้ว** จากผลทดสอบและกรอกเมื่อคำสั่งถาม. `git fetch` และ `git worktree add` เปลี่ยน metadata Git/สร้าง directory ใหม่ แต่ไม่ reset หรือ checkout ทับไฟล์ production เดิม.

```bash
set -euo pipefail
OLD=/home/lamy/Elegant-Solutions
read -r -p 'Approved full commit SHA: ' DEPLOY_SHA
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]
RELEASE=/home/lamy/elegant-releases/$DEPLOY_SHA
test ! -e "$RELEASE"
git -C "$OLD" fetch origin feature/cross-platform-tracking-agent-exam
git -C "$OLD" cat-file -e "$DEPLOY_SHA^{commit}"
install -d -m 750 /home/lamy/elegant-releases
git -C "$OLD" worktree add --detach "$RELEASE" "$DEPLOY_SHA"
test "$(git -C "$RELEASE" rev-parse HEAD)" = "$DEPLOY_SHA"
test "$(sha256sum "$RELEASE/web/prisma/migrations/20260514051539_idk/migration.sql" | cut -d' ' -f1)" = b8f9b525a16c5f23af233390111e7570938ff42c25f5c10e4114dd73cc21da75
for file in "$OLD/web"/.env "$OLD/web"/.env.production "$OLD/web"/.env.production.local; do
  if test -f "$file"; then install -m 600 "$file" "$RELEASE/web/$(basename "$file")"; fi
done
test -f "$RELEASE/web/.env" || { echo 'STOP: DATABASE_URL/Auth env source is not established'; exit 1; }
```

ตรวจ key ที่ต้องใช้ในไฟล์ใหม่โดยไม่แสดงค่า: `grep -q '^DATABASE_URL=' "$RELEASE/web/.env"` และ `grep -q '^AUTH_SECRET=' "$RELEASE/web/.env"`. หากไม่ผ่าน ให้หยุด. ตรวจด้วยว่าค่า `AUTH_SECRET`, `AUTH_URL`, OAuth/AI config ใน release ถูกส่งต่อจาก deployment เดิมอย่างปลอดภัย; อย่าสร้างค่าใหม่ระหว่างอัปเดต เพราะจะทำให้ session เดิมใช้ไม่ได้.

## 4. Stage installer สำหรับ download endpoint

สร้าง directory บนเซิร์ฟเวอร์:

```bash
INSTALLERS=/home/lamy/elegant-installers/0.5.0
install -d -m 750 "$INSTALLERS"
if grep -q '^AGENT_INSTALLER_DIR=' "$RELEASE/web/.env.production.local" 2>/dev/null; then
  echo 'STOP: review existing AGENT_INSTALLER_DIR before continuing'; exit 1
fi
printf 'AGENT_INSTALLER_DIR=%s\n' "$INSTALLERS" >> "$RELEASE/web/.env.production.local"
chmod 600 "$RELEASE/web/.env.production.local"
```

จาก Mac ที่มีไฟล์แพ็กเกจที่ตรวจ checksum แล้ว ให้ส่งเฉพาะแพ็กเกจทั้งสี่ด้วย `scp` (ไม่ส่ง CSV, backup หรือ config). เปลี่ยน path ฝั่ง Mac หากเก็บ artifacts คนละที่:

```bash
cd /Users/fafromh0me/Developer/Zenith
scp agent/release/ElegantAgentSetup_0.5.0_x64.exe agent/elegant-agent_0.5.0_darwin_arm64.pkg agent/release/elegant-agent_0.5.0_darwin_x86_64.pkg agent/elegant-agent_0.5.0_amd64.deb lamy@103.216.158.221:/home/lamy/elegant-installers/0.5.0/
```

บนเซิร์ฟเวอร์ ตรวจ checksum ก่อนเปิด download endpoint:

```bash
cd /home/lamy/elegant-installers/0.5.0
printf '%s  %s\n' \
  c3e5ebe7c608def840637897365ada3582ecfea8f9ab8a198cc341a96e360eb1 ElegantAgentSetup_0.5.0_x64.exe \
  e172eb7257dc8c657b1905ad45b17fd7aece9ebf64a3f83e2b19c894b8855391 elegant-agent_0.5.0_darwin_arm64.pkg \
  4e34d30ac4b77731a1b2c25a99e7212b0119d4670132b245b1df9057f25938ad elegant-agent_0.5.0_darwin_x86_64.pkg \
  140903ffbf441a8147b77cc5a312222f67c184e94829b6cb07bd052b1181ca3c elegant-agent_0.5.0_amd64.deb | sha256sum -c -
```

ไฟล์เหล่านี้เป็นแพ็กเกจที่ build/test แล้ว แต่ยังไม่มีหลักฐานติดตั้งจริง. `AGENT_INSTALLER_DIR` ใช้กับ route admin เท่านั้นและห้ามวาง directory ใน web root.

## 5. ติดตั้ง dependencies, build, migrate และ smoke test

```bash
set -euo pipefail
cd "$RELEASE/web"
pnpm install --frozen-lockfile
pnpm exec prisma generate --config ./prisma.config.ts
pnpm build
set +e
pnpm exec prisma migrate status --config ./prisma.config.ts
STATUS=$?
set -e
test "$STATUS" -eq 1
```

Prisma ให้ exit code `1` เมื่อยังมี pending migration; `test` ข้างบนตรวจกรณีนี้. ก่อน migrate ให้ **อ่านผล status** ว่าแสดงเฉพาะเจ็ด migration ใหม่เป็น pending และไม่มี migration จากฐานข้อมูลที่หายไปใน directory. หากผลต่างจากนี้ ให้หยุด. คำสั่งถัดไปเป็น **จุดเปลี่ยน schema production** ซึ่งต้องมีอนุมัติเฉพาะขั้นตอนและ backup ที่ตรวจแล้ว:

```bash
pnpm exec prisma migrate deploy --config ./prisma.config.ts
pnpm exec prisma migrate status --config ./prisma.config.ts
pnpm exec prisma migrate diff --config ./prisma.config.ts --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Migrations ใหม่เป็นการเพิ่มตาราง/คอลัมน์/enum/FK และ backfill `building`/`floor` ของห้องที่ตรงรูปแบบ; การสลับแอปกลับเวอร์ชันเดิมจึงไม่ต้องลบ schema. ห้ามใช้ `db push --accept-data-loss`, `migrate reset`, `git reset --hard` หรือ `git clean`.

ทดสอบแอปใหม่ที่พอร์ต `3001` โดยไม่สลับ Nginx:

```bash
pm2 start pnpm --name elegant-v050-smoke --cwd "$RELEASE/web" -- start --port 3001
curl --retry 10 --retry-delay 2 --retry-connrefused --fail --silent --show-error http://127.0.0.1:3001/api/liveness
test "$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3001/api/agent/activate)" = 405
pm2 stop elegant-v050-smoke
pm2 delete elegant-v050-smoke
```

GET `activate` ควรเป็น 405 เพราะ route รองรับ POST. การทดสอบ auth ผ่าน `127.0.0.1:3001` อาจไม่ผ่านการตรวจ trusted host ของ Auth.js เพราะ production ใช้โดเมนจริง; ให้ตรวจ auth ผ่านโดเมน HTTPS หลัง cutover. การตรวจนี้ยังไม่พิสูจน์ activation หรือ dashboard จริง.

## 6. Cutover และตรวจปลายทาง

มี downtime สั้น ๆ ระหว่างสลับ PM2 เพราะ Nginx เดิมส่งไปพอร์ต `3000`. เก็บ PM2 app `elegant` เดิมไว้ในสถานะ stopped เพื่อย้อนกลับได้:

```bash
set -euo pipefail
pm2 stop elegant
pm2 start pnpm --name elegant-v050 --cwd "$RELEASE/web" -- start --port 3000
curl --retry 10 --retry-delay 2 --retry-connrefused --fail --silent --show-error http://127.0.0.1:3000/api/liveness
curl --retry 10 --retry-delay 2 --fail --silent --show-error https://elegant.fafromh0me.com/api/liveness
test "$(curl --silent --output /dev/null --write-out '%{http_code}' https://elegant.fafromh0me.com/api/tracking/snapshot)" = 401
test "$(curl --silent --output /dev/null --write-out '%{http_code}' https://elegant.fafromh0me.com/api/admin/agent/installers/windows-x64)" = 401
pm2 describe elegant-v050
pm2 save
```

ตรวจหน้า `/admin/system` ด้วย Super Admin, สร้าง Batch ทดสอบหนึ่งเครื่อง, ดาวน์โหลด CSV ครั้งเดียว, ดาวน์โหลด installer หลัง login และตรวจ `/admin/tracking`. จากนั้นจึงติดตั้ง Agent บนเครื่องนำร่องจริง. ห้ามใช้ `GET /api/agent/activate` เพียงอย่างเดียวเป็นหลักฐานว่า POST activation ผ่าน.

## 7. Rollback แอปโดยคงฐานข้อมูลไว้

หาก health check หรือการใช้งานหลักล้มเหลว ให้หยุดแอปใหม่และกลับไปใช้ PM2 app เดิมทันที:

```bash
pm2 stop elegant-v050
pm2 restart elegant
curl --retry 10 --retry-delay 2 --retry-connrefused --fail --silent --show-error http://127.0.0.1:3000/
curl --retry 10 --retry-delay 2 --fail --silent --show-error https://elegant.fafromh0me.com/
pm2 save
```

อย่า rollback database โดยอัตโนมัติ: การ restore backup ทับ production หลังมีข้อมูลใหม่จะทำข้อมูลหลัง backup สูญหาย. หาก schema มีปัญหาที่แก้ด้วย application rollback ไม่ได้ ให้หยุดรับ writes, เก็บ backup ปัจจุบันอีกชุด, restore backup ก่อน deploy **ลงฐานข้อมูลใหม่**, ตรวจความครบถ้วน และขออนุมัติแยกสำหรับการสลับ `DATABASE_URL`. ไม่แตะ `ezdn_postgres`.

## ข้อจำกัดก่อนอนุมัติจริง

- ยังไม่ตรวจ Node/pnpm เวอร์ชัน, แหล่ง production env, สิทธิ์ PM2/Git, ความพอของ disk ระหว่าง Linux build และ config Nginx/Cloudflare หลัง cutover จาก SSH ในรอบเตรียมนี้.
- ยังไม่ติดตั้ง Agent บน Windows/macOS/Ubuntu จริง, จึงยังไม่ยืนยัน activation, dashboard, activity และ reboot กับ backend production.
- Origin เปิดพอร์ต `3000` และ `8000` ต่อภายนอกตามการตรวจครั้งก่อน; ควรวางแผนปิดการเข้าถึงตรงและตรวจ HTTPS/real client IP กับผู้ดูแลเซิร์ฟเวอร์ใน change แยก ไม่ผูกกับ schema migration แบบเร่งด่วน.
