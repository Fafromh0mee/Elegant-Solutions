export function getRoleLabel(role: string): string {
  switch (role) {
    case "STUDENT":
      return "นักศึกษา";
    case "ADMIN":
      return "ผู้ดูแลระบบ";
    case "SUPER_ADMIN":
      return "ผู้ดูแลระบบระดับสูง";
    case "GUEST":
      return "ผู้เยี่ยมชม";
    default:
      return role;
  }
}

export function getAccountStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "รออนุมัติ";
    case "APPROVED":
      return "อนุมัติแล้ว";
    case "REJECTED":
      return "ไม่อนุมัติ";
    default:
      return status;
  }
}

export function getRiskLevelLabel(level: string): string {
  switch (level) {
    case "NORMAL":
      return "ปกติ";
    case "WATCH":
      return "เฝ้าระวัง";
    case "BLOCKED":
      return "ถูกระงับ";
    default:
      return level;
  }
}

export function getBookingStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "รออนุมัติ";
    case "APPROVED":
      return "อนุมัติแล้ว";
    case "REJECTED":
      return "ไม่อนุมัติ";
    case "CANCELLED":
      return "ยกเลิกแล้ว";
    default:
      return status;
  }
}

export function getRoomCapabilityLabel(capability: string): string {
  switch (capability) {
    case "CLASSROOM":
      return "ห้องเรียน";
    case "LAB":
      return "ห้องปฏิบัติการ";
    case "MEETING":
      return "ห้องประชุม";
    case "WORKSHOP":
      return "ห้องเวิร์กช็อป";
    case "EVENT":
      return "ห้องจัดกิจกรรม";
    default:
      return capability;
  }
}

export function getApprovalPolicyLabel(policy: string): string {
  switch (policy) {
    case "AUTO":
      return "อนุมัติอัตโนมัติ";
    case "MANUAL":
      return "ต้องได้รับการอนุมัติจากผู้ดูแลระบบ";
    default:
      return policy;
  }
}

export function getAvailabilityStatusLabel(status: string): string {
  switch (status) {
    case "AVAILABLE":
      return "พร้อมใช้งาน";
    case "ROOM_INACTIVE":
      return "ปิดใช้งาน";
    case "BOOKING_DISABLED":
      return "ไม่เปิดให้จอง";
    case "NOT_CONFIGURED_CAPABILITIES":
      return "ยังไม่ได้ตั้งค่าประเภทพื้นที่";
    case "NOT_CONFIGURED_CAPACITY":
      return "ยังไม่ได้ตั้งค่าความจุ";
    case "CAPABILITY_MISMATCH":
      return "ไม่ตรงประเภทพื้นที่";
    case "OUTSIDE_WINDOW":
      return "นอกช่วงเปิดใช้งาน";
    case "CLOSED":
      return "ปิดปรับปรุง";
    case "CLASS_IN_SESSION":
      return "กำลังมีการเรียน";
    case "FULL":
      return "ห้องเต็ม";
    default:
      return status;
  }
}

export function getAvailabilityErrorMessage(code: string): string {
  switch (code) {
    case "INVALID_DATE":
      return "วันที่ไม่ถูกต้อง";
    case "NO_SLOTS":
      return "กรุณาเลือกช่วงเวลาอย่างน้อย 1 คาบ";
    case "DUPLICATE_SLOTS":
      return "เลือกช่วงเวลาซ้ำกัน";
    case "INVALID_SLOT":
      return "ช่วงเวลาไม่ถูกต้อง";
    case "INVALID_PARTY_SIZE":
      return "จำนวนผู้ใช้งานต้องเป็นจำนวนเต็มที่มากกว่า 0";
    case "INVALID_CAPABILITY":
      return "ประเภทพื้นที่ไม่ถูกต้อง";
    case "INVALID_BUILDING":
      return "อาคารไม่ถูกต้อง";
    case "INVALID_FLOOR":
      return "ชั้นไม่ถูกต้อง";
    case "INVALID_ONLY_AVAILABLE":
      return "ตัวกรองห้องว่างไม่ถูกต้อง";
    case "INVALID_LIMIT":
      return "จำนวนผลลัพธ์ไม่ถูกต้อง";
    case "UNAUTHENTICATED":
      return "กรุณาเข้าสู่ระบบ";
    case "ROOM_NOT_FOUND":
      return "ไม่พบห้องนี้";
    default:
      return "เกิดข้อผิดพลาด";
  }
}
