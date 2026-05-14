"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Navbar } from "@/components/navbar";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      // TODO: Replace with actual API endpoint
      // For now, just simulate a successful submission
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setSuccess(true);
      setFormData({
        name: "",
        email: "",
        phone: "",
        subject: "",
        message: "",
      });

      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError("ส่งข้อความไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Navbar />
      {/* Header Section */}
      <div className="bg-linear-to-b from-(--color-primary-light) to-white py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            ติดต่อเรา
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl">
            มีคำถามหรือข้อเสนอแนะ? เรายินดีที่จะได้ยินจากคุณ
            กรุณากรอกแบบฟอร์มด้านล่างและทีมของเราจะติดต่อคุณในเร็วๆ นี้
          </p>
        </div>
      </div>

      {/* Content Section */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Contact Information */}
          <div className="lg:col-span-1">
            <div className="space-y-6">
              {/* Email */}
              <div className="flex gap-4">
                <div className="shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--color-primary-light)">
                    <Mail className="h-6 w-6 text-(--color-primary)" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">อีเมล</h3>
                  <p className="text-gray-600 mt-1">
                    <a
                      href="mailto:support@elegantsolute.com"
                      className="hover:text-(--color-primary) transition-colors"
                    >
                      support@elegantsolute.com
                    </a>
                  </p>
                </div>
              </div>

              {/* Phone */}
              <div className="flex gap-4">
                <div className="shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--color-primary-light)">
                    <Phone className="h-6 w-6 text-(--color-primary)" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    โทรศัพท์
                  </h3>
                  <p className="text-gray-600 mt-1">
                    <a
                      href="tel:+66900000000"
                      className="hover:text-(--color-primary) transition-colors"
                    >
                      +66 (90) 000-0000
                    </a>
                  </p>
                </div>
              </div>

              {/* Address */}
              <div className="flex gap-4">
                <div className="shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--color-primary-light)">
                    <MapPin className="h-6 w-6 text-(--color-primary)" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    ที่อยู่
                  </h3>
                  <p className="text-gray-600 mt-1">Bangkok, Thailand</p>
                </div>
              </div>

              {/* Hours */}
              <div className="flex gap-4">
                <div className="shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--color-primary-light)">
                    <Clock className="h-6 w-6 text-(--color-primary)" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    เวลาทำการ
                  </h3>
                  <p className="text-gray-600 mt-1">
                    จันทร์ - ศุกร์ 09:00 - 18:00 น.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl bg-white shadow-lg p-8 border border-gray-100">
              {success && (
                <div className="mb-6 rounded-lg bg-green-50 border border-green-200 p-4 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-green-900">
                      ส่งข้อความสำเร็จ!
                    </h3>
                    <p className="text-sm text-green-800 mt-1">
                      ขอบคุณสำหรับการติดต่อเรา ทีมของเราจะตอบกลับให้คุณในเร็วๆ
                      นี้
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900">
                      เกิดข้อผิดพลาด
                    </h3>
                    <p className="text-sm text-red-800 mt-1">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    ชื่อของคุณ
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="กรอกชื่อของคุณ"
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 transition-all"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    อีเมล
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="กรอกอีเมลของคุณ"
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 transition-all"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    โทรศัพท์ (ไม่บังคับ)
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="กรอกเบอร์โทรศัพท์ของคุณ"
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 transition-all"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    หัวข้อ
                  </label>
                  <input
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder="เลือกหัวข้อของการติดต่อ"
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 transition-all"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    ข้อความ
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="เขียนข้อความของคุณ..."
                    required
                    rows={5}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 transition-all resize-none"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary py-3 rounded-lg font-medium"
                >
                  {loading ? (
                    "กำลังส่ง..."
                  ) : (
                    <>
                      <Send className="inline h-4 w-4 mr-2" />
                      ส่งข้อความ
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-(--color-primary) hover:text-opacity-70 transition-all"
          >
            ← กลับไปหน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  );
}
