"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-(--color-primary-light) to-white px-4">
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
          <h1 className="text-2xl font-bold text-center mb-6">เข้าสู่ระบบ</h1>

          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            นักศึกษา: เข้าระบบด้วย Google | Guest: ใช้อีเมลและรหัสผ่าน
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label htmlFor="password" className="label">
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input pr-10"
                  placeholder="••••••••"
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

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">หรือ</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            {googleLoading ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600 border-t-transparent" />
                กำลังเชื่อมต่อ Google...
              </>
            ) : (
              <>
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                เข้าสู่ระบบด้วย Google (Student)
              </>
            )}
          </button>

          <p className="mt-6 text-center text-sm text-gray-500">
            ยังไม่มีบัญชี?{" "}
            <Link
              href="/register"
              className="text-(--color-secondary) hover:text-(--color-secondary-dark) font-medium"
            >
              สมัครสมาชิก
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
