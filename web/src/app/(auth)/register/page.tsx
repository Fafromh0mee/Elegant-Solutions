"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { registerAction } from "@/actions/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน");
      return;
    }

    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    setLoading(true);

    try {
      const result = await registerAction({ name, email, password, phone });

      if (result.error) {
        setError(result.error);
      } else {
        router.push("/pending-approval?registered=true");
      }
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-(--color-primary-light) to-white px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex flex-col items-center gap-2 justify-center"
          >
            <svg
              width="56"
              height="56"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="20"
                y="12"
                width="59.1667"
                height="75.8333"
                rx="26.7473"
                fill="url(#paint0_radial_504_8)"
              />
              <path
                d="M33.75 81.5C22.5 81.5 20 65 20 61.9167C20 58.8333 24.1667 68.0265 42.0833 61.7765C55.0868 57.2404 77.0889 44.6574 88.1781 38.0974C89.0396 37.5878 89.9257 38.7414 89.1899 39.4201C75.6812 51.8801 42.6338 81.5 33.75 81.5Z"
                fill="url(#paint1_radial_504_8)"
              />
              <path
                d="M38.4946 28.6398V35.3064"
                stroke="#0041C9"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M45.1613 46.1393C48.6792 48.5428 50.495 48.4624 53.4946 46.1393"
                stroke="#0041C9"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M60.9946 28.6398V35.3064"
                stroke="#0041C9"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <defs>
                <radialGradient
                  id="paint0_radial_504_8"
                  cx="0"
                  cy="0"
                  r="1"
                  gradientTransform="matrix(-10.6359 70.2967 -54.8468 -5.70751 60.2193 17.5367)"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#B7D7FF" />
                  <stop offset="0.652855" stopColor="#67ACFF" />
                  <stop offset="1" stopColor="#2E67AC" />
                </radialGradient>
                <radialGradient
                  id="paint1_radial_504_8"
                  cx="0"
                  cy="0"
                  r="1"
                  gradientUnits="userSpaceOnUse"
                  gradientTransform="translate(90.8333 35.25) rotate(143.302) scale(77.3933 122.2)"
                >
                  <stop stopColor="#6999FF" />
                  <stop offset="0.576923" stopColor="#0052FF" />
                  <stop offset="1" stopColor="#003199" />
                </radialGradient>
              </defs>
            </svg>
            <span className="text-xl font-bold text-gray-900">
              Elegant Solutions
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="card">
          <h1 className="text-2xl font-bold text-center mb-2">สมัครสมาชิก</h1>
          <p className="text-center text-sm text-gray-500 mb-6">
            สมัครแบบ Guest (ต้องรอ Admin อนุมัติก่อนใช้งาน)
          </p>

          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            หากเป็นนักศึกษา กรุณาใช้งานปุ่ม Google ที่หน้าเข้าสู่ระบบ
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="label">
                ชื่อ-นามสกุล
              </label>
              <input
                id="name"
                type="text"
                className="input"
                placeholder="กรุณากรอกชื่อ-นามสกุล"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="label">
                อีเมล
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="phone" className="label">
                เบอร์โทรศัพท์ (ไม่บังคับ)
              </label>
              <input
                id="phone"
                type="tel"
                className="input"
                placeholder="0xx-xxx-xxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input pr-10"
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label">
                ยืนยันรหัสผ่าน
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="input"
                placeholder="กรอกรหัสผ่านอีกครั้ง"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            มีบัญชีอยู่แล้ว?{" "}
            <Link
              href="/login"
              className="text-(--color-secondary) hover:text-(--color-secondary-dark) font-medium"
            >
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
