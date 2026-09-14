"use client";

import { useState, useEffect } from "react";
import { User, Lock, Save } from "lucide-react";
import {
  getProfileAction,
  updateProfileAction,
  changePasswordAction,
} from "@/actions/profile";
import type { AuthUser } from "@/lib/types";

export function ProfileClient({ user }: { user: AuthUser }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getProfileAction().then((result) => {
      if (result.user) {
        setName(result.user.name);
        setPhone(result.user.phone || "");
      }
    });
  }, []);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const result = await updateProfileAction({ name, phone });
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("อัพเดทโปรไฟล์สำเร็จ!");
    }
    setLoading(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("รหัสผ่านใหม่ไม่ตรงกัน");
      return;
    }

    if (newPassword.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    setLoading(true);

    const result = await changePasswordAction({
      currentPassword,
      newPassword,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("เปลี่ยนรหัสผ่านสำเร็จ!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">
        <User className="inline h-6 w-6 mr-2" />
        โปรไฟล์
      </h1>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Profile Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">ข้อมูลส่วนตัว</h2>
        <div className="mb-4">
          <span className="text-sm text-gray-500">บทบาท: </span>
          <span
            className={
              user.role === "SUPER_ADMIN"
                ? "badge-super-admin"
                : user.role === "ADMIN"
                  ? "badge-admin"
                  : user.role === "STUDENT"
                    ? "badge-student"
                    : "badge-guest"
            }
          >
            {user.role}
          </span>
        </div>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="label">อีเมล</label>
            <input
              type="email"
              className="input bg-gray-50"
              value={user.email}
              disabled
            />
          </div>
          <div>
            <label className="label">ชื่อ-นามสกุล</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">เบอร์โทรศัพท์</label>
            <input
              type="tel"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0xx-xxx-xxxx"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            <Save className="h-4 w-4" />
            {loading ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">
          <Lock className="inline h-5 w-5 mr-2" />
          เปลี่ยนรหัสผ่าน
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="label">รหัสผ่านปัจจุบัน</label>
            <input
              type="password"
              className="input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">รหัสผ่านใหม่</label>
            <input
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              required
            />
          </div>
          <div>
            <label className="label">ยืนยันรหัสผ่านใหม่</label>
            <input
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            <Lock className="h-4 w-4" />
            {loading ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
          </button>
        </form>
      </div>
    </div>
  );
}
