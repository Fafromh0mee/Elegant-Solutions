// จุดต่อกลอนประตูจริง — ตอนนี้ยังไม่มีอุปกรณ์จริง (เช่น ESP32 + relay + กลอนไฟฟ้า)
// จึงจำลองผลลัพธ์ไว้ก่อน เมื่อมีอุปกรณ์จริงแล้ว "แก้เฉพาะฟังก์ชันนี้ที่เดียว" ไม่ต้องแตะโค้ด
// ส่วนอื่นของระบบ (หน้า gate เรียกผ่าน unlockDoorAction ซึ่งเรียกฟังก์ชันนี้อยู่แล้ว)
//
// ตัวอย่างถ้าเป็น ESP32 ที่เปิดรับคำสั่งผ่าน HTTP (แค่ตัวอย่างคร่าวๆ ไม่ได้ implement จริง):
//
//   const controllerIp = ROOM_DOOR_CONTROLLER_IP[roomCode]; // แมป roomCode → IP ของ ESP32 แต่ละห้อง
//   const res = await fetch(`http://${controllerIp}/unlock`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ roomId }),
//     signal: AbortSignal.timeout(5000),
//   });
//   return { success: res.ok };

export async function unlockDoor({
  roomId,
  roomCode,
}: {
  roomId: string;
  roomCode: string;
}): Promise<{ success: boolean }> {
  console.log(
    `[DOOR SIMULATION] จำลองการปลดล็อกห้อง ${roomCode} (ยังไม่ได้เชื่อมต่ออุปกรณ์จริง)`,
  );

  return { success: true };
}
