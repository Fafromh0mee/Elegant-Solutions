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
      return "ปฏิเสธแล้ว";
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

export function getRoomFinderErrorMessage(code: string): string {
  switch (code) {
    case "INVALID_PARTY_SIZE":
      return "กรุณาระบุจำนวนผู้ใช้งานเป็นจำนวนเต็มตั้งแต่ 1 คนขึ้นไป";
    case "INVALID_DATE":
      return "วันที่ไม่ถูกต้อง";
    case "DATE_OUT_OF_RANGE":
      return "ค้นหาได้ตั้งแต่วันนี้ถึงล่วงหน้า 30 วัน";
    case "NO_SLOTS":
      return "กรุณาเลือกคาบอย่างน้อย 1 คาบ";
    case "NO_SLOTS_LEFT_TODAY":
      return "วันนี้ไม่มีคาบเหลือแล้ว กรุณาเลือกวันอื่น";
    case "INVALID_SLOT":
      return "คาบที่เลือกไม่ถูกต้อง";
    case "SLOTS_NOT_CONTIGUOUS":
      return "กรุณาเลือกคาบที่ต่อเนื่องกัน";
    case "SLOT_ENDED":
      return "คาบที่เลือกสิ้นสุดไปแล้ว กรุณาเลือกคาบถัดไปหรือวันอื่น";
    case "INVALID_CAPABILITY":
      return "ประเภทพื้นที่ไม่ถูกต้อง";
    case "INVALID_BUILDING":
      return "อาคารไม่ถูกต้อง";
    case "INVALID_FLOOR":
      return "ชั้นไม่ถูกต้อง";
    default:
      return "เกิดข้อผิดพลาด";
  }
}

/**
 * Why a booking cannot be made. Finder input errors fall back to getRoomFinderErrorMessage.
 * `detail` is either the remaining-capacity number (CAPACITY_INSUFFICIENT) or a
 * participant's display name (DUPLICATE_BOOKING / OVERLAPPING_BOOKING /
 * INELIGIBLE_PARTICIPANT / GUEST_ROOM_NOT_ALLOWED, when the issue concerns someone
 * other than the viewer themselves).
 */
export function getBookingErrorMessage(code: string, detail?: number | string): string {
  switch (code) {
    case "INVALID_ROOM":
    case "ROOM_NOT_FOUND":
      return "ไม่พบห้องนี้ กรุณากลับไปค้นหาห้องอีกครั้ง";
    case "SLOT_TOO_LATE":
      return "คาบนี้เหลือเวลาน้อยกว่า 15 นาที จึงไม่สามารถจองได้แล้ว กรุณาเลือกคาบถัดไป";
    case "NOT_ALLOWED":
      return "บัญชีนี้ไม่สามารถจองห้องได้";
    case "GUEST_ROOM_NOT_ALLOWED":
      return typeof detail === "string"
        ? `ห้องนี้ไม่เปิดให้บุคคลภายนอกจอง แต่ ${detail} เป็นบุคคลภายนอก`
        : "ห้องนี้ไม่ได้เปิดให้บุคคลภายนอกจองแล้ว กรุณาเลือกห้องอื่น";
    case "ROOM_NOT_BOOKABLE":
      return "ห้องนี้ไม่เปิดให้จองแล้ว กรุณาเลือกห้องอื่น";
    case "CAPABILITY_CHANGED":
      return "ห้องนี้ไม่ตรงกับประเภทพื้นที่ที่คุณค้นหาแล้ว กรุณาค้นหาห้องอีกครั้ง";
    case "OUTSIDE_WINDOW":
      return "ห้องนี้ไม่เปิดให้ใช้ในช่วงเวลาที่เลือกแล้ว";
    case "CLOSED":
      return "ห้องนี้ปิดปรับปรุงในช่วงเวลาที่เลือก";
    case "CLASS_IN_SESSION":
      return "ห้องนี้มีการเรียนการสอนในช่วงเวลาที่เลือก จึงไม่สามารถจองได้";
    case "CAPACITY_INSUFFICIENT":
      return typeof detail === "number" && detail > 0
        ? `ที่ว่างไม่พอแล้ว ห้องนี้จองเพิ่มได้อีก ${detail} ที่ในช่วงเวลาที่เลือก`
        : "ห้องนี้ถูกจองเต็มแล้วในช่วงเวลาที่เลือก";
    case "DUPLICATE_BOOKING":
      return typeof detail === "string"
        ? `${detail} มีการจองห้องนี้ในช่วงเวลาที่ทับซ้อนกันอยู่แล้ว`
        : "คุณมีการจองห้องนี้ในช่วงเวลาที่ทับซ้อนกันอยู่แล้ว";
    case "OVERLAPPING_BOOKING":
      return typeof detail === "string"
        ? `${detail} มีการจองห้องอื่นในช่วงเวลานี้อยู่แล้ว`
        : "คุณมีการจองห้องอื่นในช่วงเวลานี้อยู่แล้ว";
    case "INVALID_PARTICIPANTS":
      return "ข้อมูลผู้เข้าร่วมไม่ถูกต้อง";
    case "GROUP_NOT_FOUND":
      return "ไม่พบกลุ่มนี้";
    case "NOT_GROUP_OWNER":
      return "คุณไม่ใช่เจ้าของกลุ่มนี้ จึงไม่สามารถใช้กลุ่มนี้จองห้องได้";
    case "GROUP_MEMBERSHIP_CHANGED":
      return "รายชื่อสมาชิกกลุ่มมีการเปลี่ยนแปลงตั้งแต่ครั้งล่าสุดที่ตรวจสอบ กรุณาตรวจสอบกลุ่มอีกครั้งก่อนยืนยัน";
    case "INELIGIBLE_PARTICIPANT":
      return typeof detail === "string"
        ? `${detail} ยังไม่มีสิทธิ์เข้าร่วมการจองนี้ (ต้องเป็นนักศึกษา หรือบุคคลภายนอกที่ได้รับการอนุมัติแล้ว)`
        : "มีสมาชิกในกลุ่มที่ยังไม่มีสิทธิ์จองห้อง";
    case "BUSY":
      return "มีผู้จองห้องนี้พร้อมกันจำนวนมาก กรุณาลองใหม่อีกครั้ง";
    case "FAILED":
      return "จองห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
    default:
      return getRoomFinderErrorMessage(code);
  }
}

/** Feature 8: why an admin's approve/reject did not go through (admin-facing wording). */
export function getBookingDecisionErrorMessage(code: string, detail?: { currentStatus?: string; remainingCapacity?: number; participantName?: string }): string {
  const who = detail?.participantName;
  switch (code) {
    case "NOT_ALLOWED":
      return "ไม่มีสิทธิ์อนุมัติหรือปฏิเสธการจอง";
    case "BOOKING_NOT_FOUND":
      return "ไม่พบการจองนี้";
    case "NOT_PENDING":
      return detail?.currentStatus
        ? `การจองนี้ถูกดำเนินการไปแล้ว (สถานะปัจจุบัน: ${getBookingStatusLabel(detail.currentStatus)})`
        : "การจองนี้ไม่ได้อยู่ในสถานะรออนุมัติแล้ว";
    case "INVALID_NOTE":
      return "หมายเหตุยาวเกินไป (ไม่เกิน 500 ตัวอักษร)";
    case "BOOKING_EXPIRED":
      return "เลยช่วงเวลาของการจองนี้แล้ว จึงอนุมัติไม่ได้";
    case "INELIGIBLE_PARTICIPANT":
      return who ? `${who} ไม่มีสิทธิ์ใช้ห้องแล้ว (บัญชีถูกเปลี่ยนสถานะหรือบทบาท)` : "มีผู้เข้าร่วมที่ไม่มีสิทธิ์ใช้ห้องแล้ว";
    case "GUEST_ROOM_NOT_ALLOWED":
      return who ? `ห้องนี้ไม่เปิดให้บุคคลภายนอก แต่ ${who} เป็นบุคคลภายนอก` : "ห้องนี้ไม่เปิดให้บุคคลภายนอกแล้ว";
    case "DUPLICATE_BOOKING":
      return who ? `${who} มีการจองห้องนี้ในช่วงเวลาที่ทับซ้อนอยู่แล้ว` : "มีการจองซ้ำในช่วงเวลาเดียวกันอยู่แล้ว";
    case "OVERLAPPING_BOOKING":
      return who ? `${who} มีการจองห้องอื่นในช่วงเวลานี้อยู่แล้ว` : "ผู้เข้าร่วมมีการจองอื่นในช่วงเวลานี้อยู่แล้ว";
    case "ROOM_NOT_BOOKABLE":
      return "ขณะนี้ห้องปิดใช้งานหรือปิดการจองอยู่ จึงอนุมัติไม่ได้";
    case "CAPABILITY_CHANGED":
      return "ห้องไม่ตรงกับประเภทพื้นที่ที่ขอแล้ว";
    case "OUTSIDE_WINDOW":
      return "ขณะนี้ห้องไม่เปิดให้ใช้ในช่วงเวลาของการจองนี้แล้ว";
    case "CLOSED":
      return "ห้องปิดปรับปรุงในช่วงเวลาของการจองนี้";
    case "CLASS_IN_SESSION":
      return "มีการเรียนการสอนในห้องนี้ในช่วงเวลาของการจอง";
    case "CAPACITY_INSUFFICIENT":
      return typeof detail?.remainingCapacity === "number" && detail.remainingCapacity > 0
        ? `ที่ว่างไม่พอแล้ว เหลือเพียง ${detail.remainingCapacity} ที่ในช่วงเวลานี้`
        : "ห้องเต็มแล้วในช่วงเวลาของการจองนี้ (มีการจองที่อนุมัติแล้วใช้ที่ครบ)";
    case "BUSY":
      return "มีการดำเนินการกับห้องนี้พร้อมกันจำนวนมาก กรุณาลองใหม่อีกครั้ง";
    default:
      return "ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  }
}

/** 125 -> "2 ชม. 5 นาที", 35 -> "35 นาที", 120 -> "2 ชม." */
export function formatMinutesThai(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest} นาที`;
  return rest === 0 ? `${hours} ชม.` : `${hours} ชม. ${rest} นาที`;
}
