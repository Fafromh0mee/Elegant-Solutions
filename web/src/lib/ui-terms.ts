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

export function getRoomConfigHealthLabel(health: string): string {
  switch (health) {
    case "READY":
      return "พร้อมเปิดให้จอง";
    case "INCOMPLETE":
      return "ตั้งค่าไม่ครบ";
    case "BOOKING_DISABLED":
      return "ไม่เปิดให้จอง";
    case "INACTIVE":
      return "ปิดใช้งาน";
    default:
      return health;
  }
}

export function getRoomConfigIssueLabel(issue: string): string {
  switch (issue) {
    case "MISSING_CAPABILITIES":
      return "ยังไม่ได้ตั้งค่าประเภทพื้นที่";
    case "MISSING_CAPACITY":
      return "ยังไม่ได้ตั้งค่าความจุ";
    case "MISSING_WINDOWS":
      return "ยังไม่ได้กำหนดช่วงเวลาที่เปิดให้จอง";
    default:
      return issue;
  }
}

export function getWeekdayLabel(dayOfWeek: number): string {
  return ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"][dayOfWeek] ?? String(dayOfWeek);
}

export function getRoomDependencyLabel(kind: string): string {
  switch (kind) {
    case "bookings":
      return "การจองห้อง";
    case "sessions":
      return "ประวัติการเข้าใช้ห้อง";
    case "accessTokens":
      return "รหัสเข้าใช้ห้อง";
    case "classSchedules":
      return "ตารางเรียน";
    case "logs":
      return "บันทึกการเข้าใช้ห้อง";
    case "agentMachines":
      return "เครื่องคอมพิวเตอร์ที่ผูกกับห้อง";
    default:
      return kind;
  }
}

/** "YYYY-MM-DD" calendar date -> Thai display, e.g. "29 ก.ย. 2569". */
export function formatAcademicDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("th-TH", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function getRoomAdminErrorMessage(code: string): string {
  switch (code) {
    case "UNAUTHORIZED":
      return "ไม่มีสิทธิ์ดำเนินการ";
    case "ROOM_NOT_FOUND":
      return "ไม่พบห้องนี้";
    case "DUPLICATE_ROOM_CODE":
      return "รหัสห้องนี้ถูกใช้งานแล้ว";
    case "ROOM_HAS_HISTORY":
      return "ไม่สามารถลบห้องนี้ได้เนื่องจากมีประวัติการใช้งาน กรุณาปิดใช้งานห้องแทน";
    case "CLOSURE_NOT_FOUND":
      return "ไม่พบรายการปิดปรับปรุงนี้";
    case "INVALID_NAME":
      return "กรุณากรอกชื่อห้อง (ไม่เกิน 100 ตัวอักษร)";
    case "INVALID_ROOM_CODE":
      return "รหัสห้องต้องเป็นตัวอักษรภาษาอังกฤษพิมพ์ใหญ่ ตัวเลข และขีดกลาง เช่น A4-404";
    case "INVALID_DESCRIPTION":
      return "รายละเอียดยาวเกินไป";
    case "INVALID_BUILDING":
      return "อาคารไม่ถูกต้อง";
    case "INVALID_FLOOR":
      return "ชั้นต้องเป็นจำนวนเต็ม";
    case "INVALID_CAPACITY":
      return "ความจุต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป";
    case "INVALID_CAPABILITIES":
    case "DUPLICATE_CAPABILITIES":
      return "ประเภทพื้นที่ไม่ถูกต้อง";
    case "INVALID_FLAG":
      return "ข้อมูลสถานะห้องไม่ถูกต้อง";
    case "INVALID_APPROVAL_POLICY":
      return "รูปแบบการอนุมัติไม่ถูกต้อง";
    case "INVALID_WINDOWS":
    case "INVALID_DAY":
    case "INVALID_SLOT":
    case "DUPLICATE_WINDOW":
      return "ช่วงเวลาที่เปิดให้จองไม่ถูกต้อง";
    case "INVALID_START_DATE":
      return "วันที่เริ่มต้นไม่ถูกต้อง";
    case "INVALID_END_DATE":
      return "วันที่สิ้นสุดไม่ถูกต้อง";
    case "END_BEFORE_START":
      return "วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่มต้น";
    case "END_IN_PAST":
      return "วันที่สิ้นสุดต้องไม่อยู่ในอดีต";
    case "DUPLICATE_SLOTS":
      return "เลือกคาบซ้ำกัน";
    case "INVALID_REASON":
      return "เหตุผลยาวเกินไป (ไม่เกิน 200 ตัวอักษร)";
    default:
      return "ข้อมูลไม่ถูกต้อง";
  }
}

/** Message for Auth.js's `?error=` on /login. Unknown codes get a generic message. */
export function getSignInErrorMessage(code: string): string {
  switch (code) {
    case "AccessDenied":
      return "บัญชี Google นี้ไม่ได้รับสิทธิ์เข้าสู่ระบบ นักศึกษากรุณาใช้บัญชี @bumail.net ของมหาวิทยาลัย";
    case "CredentialsSignin":
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    default:
      return "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่";
  }
}
