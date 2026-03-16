import Link from "next/link";

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-linear-to-b from-(--color-primary-light) to-white">
      <div className="w-full max-w-lg card text-center">
        <h1 className="text-2xl font-bold mb-2">รอการอนุมัติบัญชี Guest</h1>
        <p className="text-gray-600 mb-4">
          บัญชีของคุณยังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ
          จึงยังไม่สามารถเข้าใช้งาน dashboard ได้
        </p>
        <p className="text-sm text-gray-500 mb-6">
          หากมีข้อสงสัย กรุณาติดต่อ Facebook Elegant Solution หรืออีเมล
          admin@gmail.com
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
