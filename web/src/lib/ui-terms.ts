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
