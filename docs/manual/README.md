# Elegant Solution Complete Manual

คู่มือภาษาไทยฉบับ 0.5.0 อ้างอิง commit `ada86dadbaa1e4711cca99c56c1f1d6d83b2174a` และผลทดสอบ Mac ที่ผู้ใช้รายงานวันที่ 12 พฤศจิกายน 2026. ไฟล์ `main.tex`, `chapters/*.tex` และ `figures/diagrams.tex` แก้ไขได้. PDF เป็นผลลัพธ์ที่ build จากแหล่งเหล่านี้.

## Build

ต้องมี `tectonic` 0.16.9 หรือ XeLaTeX ที่รองรับ `fontspec`/`polyglossia` และติดตั้งฟอนต์ไทย `LINE Seed Sans TH` ในเครื่อง. ฟอนต์นี้ไม่ถูก commit หรือแจกพร้อม repository. หากเครื่องไม่มี ให้เปลี่ยน `\setmainfont`/`\setsansfont` ใน `main.tex` เป็นฟอนต์ไทยที่มี เช่น Noto Sans Thai แล้วตรวจการตัดคำและรูปหน้าใหม่.

```bash
cd docs/manual
./build.sh
pdfinfo Elegant_Solution_Complete_Manual.pdf
pdftoppm -f 1 -l 1 -r 120 -png -singlefile Elegant_Solution_Complete_Manual.pdf /tmp/elegant-cover
```

ตรวจสารบัญ, ตาราง, แผนภาพ, code block และหน้าสุดท้ายด้วย `pdftoppm`; ตรวจข้อความด้วย `pdftotext`. ห้ามนำ screenshot หรือข้อมูล production ที่มีบุคคล/secret มาใส่โดยไม่ตรวจสิทธิ์.

## โครงสร้าง

- `main.tex`: รูปแบบ A4, ปก, metadata, สารบัญ และรวมบท
- `build.sh`: สั่ง Tectonic และตั้งชื่อ PDF ผลลัพธ์
- `chapters/part1.tex`: คู่มือผู้ใช้ บท 1–7
- `chapters/part2.tex`: ติดตั้ง/บริหาร บท 8–15
- `chapters/part3.tex`: อ้างอิงเทคนิค บท 16–24
- `chapters/appendices.tex`: เช็กลิสต์ คำสั่ง อภิธานศัพท์ ประเด็นที่ต้องตรวจ
- `figures/diagrams.tex`: macro สำหรับแผนภาพเวกเตอร์ต้นฉบับ

เอกสารนี้ไม่ได้รันคำสั่ง production ระหว่างการสร้าง. ขั้นตอน deploy ที่ใช้จริงต้องอ่าน `docs/PRODUCTION_PM2_DEPLOYMENT.md` ฉบับปัจจุบันร่วมด้วย.
