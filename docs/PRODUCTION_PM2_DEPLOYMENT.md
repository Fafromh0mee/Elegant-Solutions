# เตรียมอัปเดต backend 0.5.0 บนเซิร์ฟเวอร์ PM2

เอกสารนี้เป็นขั้นตอนสำหรับผู้ดูแล **หลังอนุมัติการเตรียม release/deploy ตามช่วงงาน**. ยังไม่มีคำสั่งใดในเอกสารนี้ถูกรันบน production ระหว่างการแก้ runbook. เซิร์ฟเวอร์ที่ตรวจแล้วคือ `lamy@103.216.158.221`, Ubuntu 20.04.6, แอป PM2 5.3.0 ชื่อ `elegant` จาก `/home/lamy/Elegant-Solutions/web`, Nginx ส่งต่อไป `localhost:3000`, PostgreSQL 16 อยู่ใน Docker container `elegant-postgres`, และ URL สาธารณะคือ `https://elegant.fafromh0me.com`.

แยกช่วงงานชัดเจน: **เตรียม isolated release โดยยังไม่ migrate/restart** ใช้ข้อ 1 → 3 → สร้าง directory/config ในข้อ 4 → บล็อกแรกของข้อ 5. **หลังอนุมัติ deploy** จึงทำ backup ใหม่ในข้อ 2 → ส่ง/ตรวจ installer ในข้อ 4 → บล็อก migrate/smoke ของข้อ 5 → ข้อ 6; ข้อ 7 ใช้เมื่อจำเป็นต้อง rollback. รันบล็อกฝั่งเซิร์ฟเวอร์ใน SSH shell เดียวกันเพื่อรักษา `DEPLOY_SHA`, `RELEASE`, `STANDALONE_SERVER` และ `STANDALONE_DIR`. หาก reconnect ให้ตั้งค่าจาก commit/path ของ release ที่ตรวจแล้วก่อนทำต่อ. บล็อก `scp` ในข้อ 4 รันบน Mac อีกหน้าต่างหนึ่ง.

## หลักฐานที่ต้องผ่านก่อนอนุมัติ

- Branch สำหรับ release ต้องมี `20260514051539_idk/migration.sql` ที่ SHA-256 เท่ากับ `b8f9b525a16c5f23af233390111e7570938ff42c25f5c10e4114dd73cc21da75`. นี่คือ migration หมายเลข 10 ที่ production ใช้แล้ว; ห้ามเขียนทับ.
- การซ้อมบน PostgreSQL 16: ฐานข้อมูลใหม่ใช้ครบ 17 migrations และ backup production ที่ restore ใช้ 10 รายการเดิมตามด้วย 7 รายการใหม่. `prisma migrate diff` ต้องไม่มีความต่างกับ `schema.prisma`; user/session/room/Agent machine ต้องคงจำนวนและชุด ID.
- Preflight ล่าสุดยืนยัน Node.js `v24.13.1` (รองรับ Next.js 16/Prisma 7.3), npm `11.8.0`, PM2 `5.3.0`, RAM ว่างประมาณ `2.4 GiB`, swap ใช้ `1.8/4 GiB`, disk ว่าง `11 GB`, `/home/lamy` เขียนได้ และ PostgreSQL healthy. ค่าทรัพยากรเปลี่ยนได้ จึงตรวจอีกครั้งก่อน build.
- Global pnpm `8.8.0` ยังใช้กับแอปเดิม. **ทุกคำสั่ง install/Prisma/build ของ release ใช้ `npx --yes pnpm@9.15.9`** ซึ่งตรวจแล้วว่ารันได้โดยไม่เปลี่ยน global pnpm. ห้ามใช้ `pnpm` เปล่าใน release.
- ผู้ดูแลยืนยันว่าชื่อ environment variables ที่จำเป็นหกรายการอยู่ใน `web/.env` แล้ว. ต้องตรวจว่าไฟล์สำเนาใน release เหมือนต้นฉบับและค่าที่จำเป็นไม่ว่าง โดยไม่แสดงค่า. หาก secrets อยู่เพิ่มเฉพาะใน PM2 environment ให้หยุดและออกแบบวิธีส่งต่อก่อน cutover.
- ตรวจว่าผู้ดูแลยังมี backup ใหม่ที่อ่านได้ พร้อม SHA-256 และทราบวิธีกู้คืน. ไม่พิมพ์ค่า secret, ข้อมูลผู้ใช้ หรือเนื้อหา backup.
- Production checkout เดิมไม่สะอาด (`web/pnpm-lock.yaml` เปลี่ยน, มีไฟล์ untracked). คำสั่งด้านล่างใช้ Git worktree ใหม่และไม่แก้ checkout เดิม.

## 1. ตรวจสอบก่อนสร้าง release

```bash
ssh lamy@103.216.158.221
set -euo pipefail
OLD=/home/lamy/Elegant-Solutions
test "$(id -un)" = lamy
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(!((a===20&&b>=19)||(a===22&&b>=12)||a>=24)) process.exit(1)'
test "$(node --version)" = v24.13.1
test "$(npm --version)" = 11.8.0
test "$(pnpm --version)" = 8.8.0
test "$(npx --yes pnpm@9.15.9 --version)" = 9.15.9
test "$(pm2 --version)" = 5.3.0
pm2 pid elegant
pm2 list
free -h
df -h /home/lamy
git -C "$OLD" status --short
find "$OLD/web" -maxdepth 1 -type f -name '.env*' -printf '%f\n'
sudo docker exec elegant-postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

`node --version` ที่ยืนยันแล้วผ่านทั้ง Next.js และ Prisma. หากเวอร์ชันเปลี่ยน ให้ตรวจ `engines.node` ใหม่; อย่าอัปเกรด Node บน production เป็นส่วนหนึ่งของคำสั่งเหล่านี้. `npx` อาจเขียน cache ของผู้ใช้ แต่ไม่เปลี่ยน global pnpm. ตรวจด้วยผู้ดูแลว่า `.env` ของเว็บเดิมเป็นแหล่ง runtime secrets จริง; **การมีชื่อหกรายการไม่ได้พิสูจน์ว่าค่าถูกต้องหรือไม่ว่าง**. ห้ามนำ `.env.pilot.example` ไปแทนค่า production.

## 2. สร้าง backup ใหม่และตรวจ archive

ทำใน shell ของ `lamy` บนเซิร์ฟเวอร์หลังได้รับอนุมัติ. คำสั่งนี้ไม่แตะ container `ezdn_postgres`.

```bash
set -euo pipefail
BACKUP_DIR=/home/lamy/elegant-db-backups
install -d -m 700 "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/elegant_solutions_$(date +%Y%m%d_%H%M%S)_pre_v050.dump"
umask 077
sudo docker exec elegant-postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP"
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
  if test -f "$file"; then
    install -m 600 "$file" "$RELEASE/web/$(basename "$file")"
    cmp -s "$file" "$RELEASE/web/$(basename "$file")"
  fi
done
test -f "$RELEASE/web/.env" || { echo 'STOP: DATABASE_URL/Auth env source is not established'; exit 1; }
cmp -s "$OLD/web/.env" "$RELEASE/web/.env"
test "$(stat -c '%a' "$RELEASE/web/.env")" = 600
```

`cmp -s` ตรวจว่า `.env` ใหม่เท่าต้นฉบับทุกไบต์โดยไม่พิมพ์ค่า; **ไม่แก้ `.env` เดิม**. ตรวจ key และค่าในไฟล์สำเนา **หลังติดตั้ง dependencies** ด้วยคำสั่งข้อ 5. ตรวจด้วยว่าค่า `AUTH_SECRET`, `AUTH_URL`, OAuth/AI config ใน release ถูกส่งต่อจาก deployment เดิมอย่างปลอดภัย; อย่าสร้างค่าใหม่ระหว่างอัปเดต เพราะจะทำให้ session เดิมใช้ไม่ได้.

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

**ช่วงเตรียม release:** คำสั่งบล็อกแรกนี้สร้างไฟล์เฉพาะใน worktree ใหม่และ cache ของ `lamy`; ไม่ migrate ฐานข้อมูล ไม่เปลี่ยน PM2. `pnpm@9.15.9` ผ่านการทดสอบ `install --frozen-lockfile`, `prisma generate` และ `build` ใน checkout ชั่วคราว. `CIRCLE_NODE_TOTAL=2` ทำให้ Next.js 16.1.6 ใช้ worker เดียวในช่วงสร้างหน้า และ `NODE_OPTIONS` จำกัด heap ของแต่ละ Node process; ยังต้องดู RAM/swap จริงระหว่าง build.

```bash
set -euo pipefail
cd "$RELEASE/web"
test "$(df -Pk "$RELEASE" | awk 'NR==2 {print $4}')" -ge 6291456
test "$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)" -ge 1572864
test "$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)" -ge 1048576
NODE_ENV=development npx --yes pnpm@9.15.9 install --frozen-lockfile
node - <<'NODE'
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { parse } = require('dotenv');
const env = parse(fs.readFileSync('.env'));
const watched = /^(DATABASE_URL|AUTH_|GOOGLE_|AI_SERVICE_URL|AGENT_REGISTER_SECRET|CRON_SECRET|FACE_THRESHOLD|APP_ENVIRONMENT|NEXT_PUBLIC_)/;
for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'AUTH_URL']) {
  if (!env[key]?.trim()) { console.error(`STOP: ${key} missing or empty`); process.exit(1); }
}
for (const file of ['.env.production', '.env.production.local']) {
  if (!fs.existsSync(file)) continue;
  const override = parse(fs.readFileSync(file));
  for (const [key, value] of Object.entries(override)) {
    if (watched.test(key) && key in env && value !== env[key]) {
      console.error(`STOP: ${key} differs between ${file} and .env`); process.exit(1);
    }
  }
}
let oldApp;
try {
  oldApp = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).find((app) => app.name === 'elegant');
} catch { console.error('STOP: cannot validate existing PM2 environment'); process.exit(1); }
if (!oldApp) { console.error('STOP: existing PM2 application not found'); process.exit(1); }
for (const [key, value] of Object.entries(oldApp.pm2_env ?? {})) {
  if (watched.test(key) && (!(key in env) || String(value) !== env[key])) {
    console.error(`STOP: ${key} differs between PM2 and .env`); process.exit(1);
  }
}
for (const [key, value] of Object.entries(process.env)) {
  if (watched.test(key) && key in env && value !== env[key]) {
    console.error(`STOP: shell ${key} overrides .env`); process.exit(1);
  }
}
try {
  const db = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.pathname !== '/elegant_solutions') throw new Error();
  if (new URL(env.AUTH_URL).origin !== 'https://elegant.fafromh0me.com') throw new Error();
} catch { console.error('STOP: DATABASE_URL or AUTH_URL does not match the verified production target'); process.exit(1); }
console.log('Release runtime environment verified; secret values hidden');
NODE
npx --yes pnpm@9.15.9 exec prisma generate --config ./prisma.config.ts
CIRCLE_NODE_TOTAL=2 NODE_OPTIONS=--max-old-space-size=1536 npx --yes pnpm@9.15.9 build
test -f "$RELEASE/web/node_modules/next/dist/bin/next"
STANDALONE_SERVER=$(find "$RELEASE/web/.next/standalone" -path '*/node_modules' -prune -o -type f -name server.js -print -quit)
test -f "$STANDALONE_SERVER"
STANDALONE_DIR=$(dirname "$STANDALONE_SERVER")
install -d "$STANDALONE_DIR/.next"
test -e "$STANDALONE_DIR/public" || ln -s "$RELEASE/web/public" "$STANDALONE_DIR/public"
test -e "$STANDALONE_DIR/.next/static" || ln -s "$RELEASE/web/.next/static" "$STANDALONE_DIR/.next/static"
for env_file in .env .env.production .env.production.local; do
  if test -f "$RELEASE/web/$env_file" && test ! -e "$STANDALONE_DIR/$env_file"; then
    ln -s "$RELEASE/web/$env_file" "$STANDALONE_DIR/$env_file"
  fi
done
test -d "$STANDALONE_DIR/public"
test -d "$STANDALONE_DIR/.next/static"
cmp -s "$OLD/web/.env" "$STANDALONE_DIR/.env"
test "$(df -Pk "$RELEASE" | awk 'NR==2 {print $4}')" -ge 3145728
free -h
df -h /home/lamy
```

หาก install/build ล้มเหลวหรือทรัพยากรต่ำกว่าเกณฑ์ ให้หยุดก่อน migration; อย่า restart PM2, ปิด swap, ลบไฟล์ production เดิม หรือเปลี่ยน global pnpm เพื่อแก้เฉพาะหน้า. `11 GB` ว่างที่ตรวจล่าสุดพอสำหรับเริ่มซ้อม แต่ไม่รับประกันพื้นที่คงเหลือหลัง npm/pnpm cache และ `.next` เพิ่ม. ตรวจ `du -sh "$RELEASE/web/node_modules" "$RELEASE/web/.next"` หากต้องวิเคราะห์พื้นที่โดยไม่เปิด secret.

**ช่วง deploy หลังอนุมัติ:** `prisma migrate status` ให้ exit code `1` เมื่อมี pending migration. ตรวจผลก่อนสั่ง migrate:

```bash
set +e
npx --yes pnpm@9.15.9 exec prisma migrate status --config ./prisma.config.ts
STATUS=$?
set -e
test "$STATUS" -eq 1
```

Prisma ให้ exit code `1` เมื่อยังมี pending migration; `test` ข้างบนตรวจกรณีนี้. ก่อน migrate ให้ **อ่านผล status** ว่าแสดงเฉพาะเจ็ด migration ใหม่เป็น pending และไม่มี migration จากฐานข้อมูลที่หายไปใน directory. หากผลต่างจากนี้ ให้หยุด. คำสั่งถัดไปเป็น **จุดเปลี่ยน schema production** ซึ่งต้องมีอนุมัติเฉพาะขั้นตอนและ backup ที่ตรวจแล้ว:

```bash
npx --yes pnpm@9.15.9 exec prisma migrate deploy --config ./prisma.config.ts
npx --yes pnpm@9.15.9 exec prisma migrate status --config ./prisma.config.ts
npx --yes pnpm@9.15.9 exec prisma migrate diff --config ./prisma.config.ts --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Migrations ใหม่เป็นการเพิ่มตาราง/คอลัมน์/enum/FK และ backfill `building`/`floor` ของห้องที่ตรงรูปแบบ; การสลับแอปกลับเวอร์ชันเดิมจึงไม่ต้องลบ schema. ห้ามใช้ `db push --accept-data-loss`, `migrate reset`, `git reset --hard` หรือ `git clean`.

ทดสอบแอปใหม่ที่พอร์ต `3001` โดยไม่สลับ Nginx. เพราะ [next.config.ts](../web/next.config.ts) ใช้ `output: "standalone"`, PM2 จึงรัน `server.js` ผ่าน Node โดยตรง ไม่ใช้ `next start` หรือ global pnpm `8.8.0`. รูปแบบคำสั่งนี้ผ่านการทดสอบกับ PM2 `5.3.0` ในพื้นที่แยกและได้ `/api/liveness` 200. Production ยังต้องผ่าน smoke gate นี้เอง:

```bash
test -f "$STANDALONE_SERVER"
PORT=3001 HOSTNAME=127.0.0.1 pm2 start "$STANDALONE_SERVER" --name elegant-v050-smoke --interpreter "$(command -v node)" --cwd "$STANDALONE_DIR"
if ! curl --retry 10 --retry-delay 2 --retry-connrefused --fail --silent --show-error http://127.0.0.1:3001/api/liveness ||
   ! test "$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3001/api/agent/activate)" = 405; then
  pm2 delete elegant-v050-smoke
  echo 'STOP: smoke test failed; old application is still running'
  exit 1
fi
pm2 pid elegant-v050-smoke
pm2 delete elegant-v050-smoke
```

GET `activate` ควรเป็น 405 เพราะ route รองรับ POST. การทดสอบ auth ผ่าน `127.0.0.1:3001` อาจไม่ผ่านการตรวจ trusted host ของ Auth.js เพราะ production ใช้โดเมนจริง; ให้ตรวจ auth ผ่านโดเมน HTTPS หลัง cutover. การตรวจนี้ยังไม่พิสูจน์ activation หรือ dashboard จริง.

## 6. Cutover และตรวจปลายทาง

มี downtime สั้น ๆ ระหว่างสลับ PM2 เพราะ Nginx เดิมส่งไปพอร์ต `3000`. เก็บ PM2 app `elegant` เดิมไว้ในสถานะ stopped เพื่อย้อนกลับได้:

```bash
set -euo pipefail
rollback_app() {
  pm2 stop elegant-v050 >/dev/null 2>&1 || true
  pm2 restart elegant
}
pm2 stop elegant
if ! PORT=3000 HOSTNAME=0.0.0.0 pm2 start "$STANDALONE_SERVER" --name elegant-v050 --interpreter "$(command -v node)" --cwd "$STANDALONE_DIR" ||
   ! curl --retry 10 --retry-delay 2 --retry-connrefused --fail --silent --show-error http://127.0.0.1:3000/api/liveness ||
   ! curl --retry 10 --retry-delay 2 --fail --silent --show-error https://elegant.fafromh0me.com/api/liveness ||
   ! test "$(curl --silent --output /dev/null --write-out '%{http_code}' https://elegant.fafromh0me.com/api/tracking/snapshot)" = 401 ||
   ! test "$(curl --silent --output /dev/null --write-out '%{http_code}' https://elegant.fafromh0me.com/api/admin/agent/installers/windows-x64)" = 401; then
  rollback_app
  echo 'STOP: new application failed health checks; old PM2 application restarted'
  exit 1
fi
pm2 pid elegant-v050
pm2 list
pm2 save
```

ตรวจหน้า `/admin/system` ด้วย Super Admin, สร้าง Batch ทดสอบหนึ่งเครื่อง, ดาวน์โหลด CSV ครั้งเดียว, ดาวน์โหลด installer หลัง login และตรวจ `/admin/tracking`. จากนั้นจึงติดตั้ง Agent บนเครื่องนำร่องจริง. ห้ามใช้ `GET /api/agent/activate` เพียงอย่างเดียวเป็นหลักฐานว่า POST activation ผ่าน.

## 7. Rollback แอปโดยคงฐานข้อมูลไว้

หาก health check หรือการใช้งานหลักล้มเหลว ให้หยุดแอปใหม่และกลับไปใช้ PM2 app เดิมทันที:

```bash
pm2 stop elegant-v050 >/dev/null 2>&1 || true
pm2 restart elegant
curl --retry 10 --retry-delay 2 --retry-connrefused --fail --silent --show-error http://127.0.0.1:3000/
curl --retry 10 --retry-delay 2 --fail --silent --show-error https://elegant.fafromh0me.com/
pm2 save
```

อย่า rollback database โดยอัตโนมัติ: การ restore backup ทับ production หลังมีข้อมูลใหม่จะทำข้อมูลหลัง backup สูญหาย. หาก schema มีปัญหาที่แก้ด้วย application rollback ไม่ได้ ให้หยุดรับ writes, เก็บ backup ปัจจุบันอีกชุด แล้วหลังอนุมัติการกู้คืนให้ restore backup ก่อน deploy **ลงฐานข้อมูลใหม่** ตามตัวอย่างนี้ โดยไม่แตะ database หลักหรือ `ezdn_postgres`:

```bash
set -euo pipefail
test -f "$BACKUP"
pg_restore --list "$BACKUP" >/dev/null
ROLLBACK_DB="elegant_solutions_restore_$(date +%Y%m%d_%H%M%S)"
sudo docker exec -e ROLLBACK_DB="$ROLLBACK_DB" elegant-postgres sh -lc 'createdb -U "$POSTGRES_USER" "$ROLLBACK_DB"'
sudo docker cp "$BACKUP" elegant-postgres:/tmp/elegant_restore_before_v050.dump
sudo docker exec -e ROLLBACK_DB="$ROLLBACK_DB" elegant-postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$ROLLBACK_DB" --no-owner --no-acl --exit-on-error /tmp/elegant_restore_before_v050.dump'
sudo docker exec -e ROLLBACK_DB="$ROLLBACK_DB" elegant-postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$ROLLBACK_DB" -Atc "SELECT count(*) FROM _prisma_migrations"'
```

ตรวจจำนวน/ชุด ID ของตารางสำคัญและประวัติ migration ในฐานใหม่ก่อนขออนุมัติแยกสำหรับการสลับ `DATABASE_URL`; การสลับ URL ต้องทำใน release env ที่เกี่ยวข้อง โดยไม่แก้ `.env` ของ checkout เดิม. เก็บฐานข้อมูลหลังอัปเกรดไว้สำหรับตรวจสอบและการกู้ข้อมูลใหม่.

## ข้อจำกัดก่อนอนุมัติจริง

- ยืนยันเวอร์ชัน Node/npm/pnpm/PM2, ชื่อ env หกรายการ, RAM/swap/disk และ PostgreSQL แล้ว; ยังไม่ยืนยัน **ค่า** env ทั้งหมด, สิทธิ์ `sudo docker`/Git fetch/worktree ในคำสั่ง release, ความพอของ RAM/swap/disk ระหว่าง build จริง และการทำงานของ PM2/Next.js บนเซิร์ฟเวอร์หลัง cutover. หาก `npx --yes pnpm@9.15.9` ใช้ cache ไม่ได้หรือ network ล้มเหลวระหว่าง install ให้หยุดก่อน migration.
- ยังไม่ติดตั้ง Agent บน Windows/macOS/Ubuntu จริง, จึงยังไม่ยืนยัน activation, dashboard, activity และ reboot กับ backend production.
- Origin เปิดพอร์ต `3000` และ `8000` ต่อภายนอกตามการตรวจครั้งก่อน; ควรวางแผนปิดการเข้าถึงตรงและตรวจ HTTPS/real client IP กับผู้ดูแลเซิร์ฟเวอร์ใน change แยก ไม่ผูกกับ schema migration แบบเร่งด่วน.
