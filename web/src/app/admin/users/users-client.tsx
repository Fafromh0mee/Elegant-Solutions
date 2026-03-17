"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus, ScanFace, Edit } from "lucide-react";
import {
  createUserAction,
  deleteUserAction,
  updateUserAction,
  approveUserAction,
  rejectUserAction,
} from "@/actions/users";
import type { Role } from "@/lib/types";
import { CheckCircle, XCircle } from "lucide-react";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  studentId: string | null;
  phone: string | null;
  faceEnrolled: boolean;
  createdAt: Date;
}

export function UsersClient({ initialUsers }: { initialUsers: UserItem[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("STUDENT");
  const [phone, setPhone] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<Role>("STUDENT");
  const [editPhone, setEditPhone] = useState("");
  const [editStudentId, setEditStudentId] = useState("");
  const [studentIdOverrideReason, setStudentIdOverrideReason] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await createUserAction({
      name,
      email,
      password,
      role,
      phone,
    });
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("สร้างผู้ใช้สำเร็จ!");
      setShowCreate(false);
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
      // Refresh
      window.location.reload();
    }
    setLoading(false);
  }

  function handleEdit(user: UserItem) {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPassword("");
    setEditRole(user.role as Role);
    setEditPhone(user.phone || "");
    setEditStudentId(user.studentId || "");
    setStudentIdOverrideReason("");
    setShowCreate(false);
  }

  function handleCancelEdit() {
    setEditingUser(null);
    setEditName("");
    setEditEmail("");
    setEditPassword("");
    setEditRole("STUDENT");
    setEditPhone("");
    setEditStudentId("");
    setStudentIdOverrideReason("");
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setLoading(true);
    setError("");
    const res = await updateUserAction(editingUser.id, {
      name: editName,
      email: editEmail,
      password: editPassword || undefined,
      role: editRole,
      phone: editPhone,
      studentId: editStudentId,
      studentIdOverrideReason,
    });
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccess("อัปเดตข้อมูลสำเร็จ!");
      handleCancelEdit();
      window.location.reload();
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("ยืนยันการลบผู้ใช้นี้?")) return;

    const result = await deleteUserAction(userId);
    if (result.error) {
      setError(result.error);
    } else {
      setUsers(users.filter((u) => u.id !== userId));
      setSuccess("ลบผู้ใช้สำเร็จ!");
    }
  }

  async function handleApprove(userId: string) {
    setLoading(true);
    const result = await approveUserAction(userId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setUsers(
        users.map((u) => (u.id === userId ? { ...u, status: "APPROVED" } : u)),
      );
      setSuccess("อนุมัติบัญชีสำเร็จ!");
    }
  }

  async function handleReject(userId: string) {
    if (!confirm("ยืนยันการปฏิเสธบัญชีนี้?")) return;
    setLoading(true);
    const result = await rejectUserAction(userId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setUsers(
        users.map((u) => (u.id === userId ? { ...u, status: "REJECTED" } : u)),
      );
      setSuccess("ปฏิเสธบัญชีสำเร็จ!");
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">จัดการผู้ใช้</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          เพิ่มผู้ใช้
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError("")}
            className="float-right font-bold"
          >
            ×
          </button>
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {success}
          <button
            onClick={() => setSuccess("")}
            className="float-right font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Create User Modal */}
      {showCreate && (
        <div className="card mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">
              <UserPlus className="inline h-5 w-5 mr-2" />
              เพิ่มผู้ใช้ใหม่
            </h2>
            <button
              onClick={() => setShowCreate(false)}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <label className="label">อีเมล</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">รหัสผ่าน</label>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">บทบาท</label>
                <select
                  className="input"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="STUDENT">STUDENT</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  <option value="GUEST">GUEST</option>
                </select>
              </div>
              <div>
                <label className="label">เบอร์โทรศัพท์ (ไม่บังคับ)</label>
                <input
                  type="tel"
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "กำลังสร้าง..." : "สร้างผู้ใช้"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="btn-secondary"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit User Form */}
      {editingUser && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">แก้ไขข้อมูลผู้ใช้</h2>
            <button
              onClick={handleCancelEdit}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">ชื่อ-นามสกุล</label>
                <input
                  type="text"
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">อีเมล</label>
                <input
                  type="email"
                  className="input"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">
                  รหัsผ่านใหม่ (เว้นว่างไว้หากไม่ต้องการเปลี่ยน)
                </label>
                <input
                  type="password"
                  className="input"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="เว้นว่างหากไม่ต้องการเปลี่ยน"
                />
              </div>
              <div>
                <label className="label">บทบาท</label>
                <select
                  className="input"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                >
                  <option value="STUDENT">STUDENT</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  <option value="GUEST">GUEST</option>
                </select>
              </div>
              <div>
                <label className="label">เบอร์โทรศัพท์ (ไม่บังคับ)</label>
                <input
                  type="tel"
                  className="input"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="label">รหัสนักศึกษา (10 หลัก)</label>
                <input
                  type="text"
                  className="input"
                  value={editStudentId}
                  onChange={(e) =>
                    setEditStudentId(
                      e.target.value.replace(/\D/g, "").slice(0, 10),
                    )
                  }
                  placeholder="เช่น 1660708635"
                />
              </div>
              <div>
                <label className="label">เหตุผลการแก้ไข Student ID</label>
                <input
                  type="text"
                  className="input"
                  value={studentIdOverrideReason}
                  onChange={(e) => setStudentIdOverrideReason(e.target.value)}
                  placeholder="จำเป็นสำหรับ ADMIN กรณี override"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "กำลังอัปเดต..." : "อัปเดตข้อมูล"}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="btn-secondary"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 pr-4">ชื่อ</th>
              <th className="pb-3 pr-4">อีเมล</th>
              <th className="pb-3 pr-4">บทบาท</th>
              <th className="pb-3 pr-4">สถานะ</th>
              <th className="pb-3 pr-4">Student ID</th>
              <th className="pb-3 pr-4">Face</th>
              <th className="pb-3 pr-4">เบอร์โทร</th>
              <th className="pb-3 pr-4">วันที่สร้าง</th>
              <th className="pb-3">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b last:border-0">
                <td className="py-3 pr-4 font-medium">{user.name}</td>
                <td className="py-3 pr-4">{user.email}</td>
                <td className="py-3 pr-4">
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
                </td>
                <td className="py-3 pr-4">
                  {user.status === "PENDING" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                      รอการอนุมัติ
                    </span>
                  ) : user.status === "APPROVED" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      อนุมัติแล้ว
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                      ปฏิเสธ
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">{user.studentId || "-"}</td>
                <td className="py-3 pr-4">
                  {user.role !== "GUEST" ? (
                    user.faceEnrolled ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                        <ScanFace className="h-3.5 w-3.5" /> Enrolled
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">
                        ยังไม่ลงทะเบียน
                      </span>
                    )
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-gray-500">{user.phone || "-"}</td>
                <td className="py-3 pr-4 text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString("th-TH")}
                </td>
                <td className="py-3">
                  <div className="flex gap-1 items-center">
                    {user.role === "GUEST" && user.status === "PENDING" && (
                      <>
                        <button
                          onClick={() => handleApprove(user.id)}
                          className="text-green-600 hover:text-green-800 p-1"
                          title="อนุมัติบัญชี"
                          disabled={loading}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleReject(user.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="ปฏิเสธบัญชี"
                          disabled={loading}
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleEdit(user)}
                      className="text-blue-500 hover:text-blue-700 p-1"
                      title="แก้ไขผู้ใช้"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="ลบผู้ใช้"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="text-center text-gray-500 py-8">ยังไม่มีผู้ใช้</p>
        )}
      </div>
    </div>
  );
}
