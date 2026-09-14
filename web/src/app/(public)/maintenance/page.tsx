import Link from "next/link";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-linear-to-b from-(--color-primary-light) to-white">
      <div className="w-full max-w-lg card text-center">
        <h1 className="text-2xl font-bold mb-2">ระบบอยู่ระหว่างปรับปรุง</h1>
        <p className="text-gray-600 mb-4">
          ขณะนี้ระบบปิดใช้งานชั่วคราวสำหรับผู้ใช้งานทั่วไป
          กรุณาลองใหม่อีกครั้งในภายหลัง
        </p>
        <p className="text-sm text-gray-500 mb-6">
          ผู้ดูแลระบบยังสามารถเข้าใช้งานผ่านหน้า Admin ได้ตามปกติ
        </p>
        <div className="flex justify-center">
          <Link href="/" className="btn-primary">
            กลับสู่หน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  );
}
