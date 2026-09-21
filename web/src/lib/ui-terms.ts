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
