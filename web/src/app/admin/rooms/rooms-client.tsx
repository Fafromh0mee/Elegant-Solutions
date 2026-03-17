"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Edit,
  DoorOpen,
  Check,
  X,
  ChevronLeft,
} from "lucide-react";
import {
  createRoomAction,
  updateRoomAction,
  deleteRoomAction,
} from "@/actions/rooms";

interface RoomItem {
  id: string;
  name: string;
  roomCode: string;
  description: string | null;
  capacity: number;
  guestAccess: boolean;
  isActive: boolean;
  createdAt: Date;
}

function parseRoomCode(roomCode: string): { building: string; floor: string } {
  const normalized = roomCode.trim().toUpperCase();
  const match = normalized.match(/^([A-Z]\d)-([1-9])\d{2}$/);
  if (!match) {
    return { building: "OTHER", floor: "OTHER" };
  }

  return {
    building: match[1],
    floor: match[2],
  };
}

export function RoomsClient({ initialRooms }: { initialRooms: RoomItem[] }) {
  const [rooms, setRooms] = useState(initialRooms);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState(0);
  const [guestAccess, setGuestAccess] = useState(false);

  // Edit form
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCapacity, setEditCapacity] = useState(0);
  const [editGuestAccess, setEditGuestAccess] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const buildingSummaries = useMemo(() => {
    const counter = new Map<string, number>();
    rooms.forEach((room) => {
      const { building } = parseRoomCode(room.roomCode);
      counter.set(building, (counter.get(building) ?? 0) + 1);
    });

    return [...counter.entries()]
      .map(([building, count]) => ({ building, count }))
      .sort((a, b) =>
        a.building.localeCompare(b.building, undefined, { numeric: true }),
      );
  }, [rooms]);

  const floorSummaries = useMemo(() => {
    if (!selectedBuilding) return [];

    const counter = new Map<string, number>();
    rooms.forEach((room) => {
      const parsed = parseRoomCode(room.roomCode);
      if (parsed.building === selectedBuilding) {
        counter.set(parsed.floor, (counter.get(parsed.floor) ?? 0) + 1);
      }
    });

    return [...counter.entries()]
      .map(([floor, count]) => ({ floor, count }))
      .sort((a, b) =>
        a.floor.localeCompare(b.floor, undefined, { numeric: true }),
      );
  }, [rooms, selectedBuilding]);

  const visibleRooms = useMemo(() => {
    if (!selectedBuilding || !selectedFloor) return [];
    return rooms
      .filter((room) => {
        const parsed = parseRoomCode(room.roomCode);
        return (
          parsed.building === selectedBuilding && parsed.floor === selectedFloor
        );
      })
      .sort((a, b) => a.roomCode.localeCompare(b.roomCode));
  }, [rooms, selectedBuilding, selectedFloor]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await createRoomAction({
      name,
      roomCode,
      description,
      capacity,
      guestAccess,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("สร้างห้องสำเร็จ!");
      setShowCreate(false);
      setName("");
      setRoomCode("");
      setDescription("");
      setCapacity(0);
      setGuestAccess(false);
      window.location.reload();
    }
    setLoading(false);
  }

  function startEdit(room: RoomItem) {
    setEditingId(room.id);
    setEditName(room.name);
    setEditDescription(room.description || "");
    setEditCapacity(room.capacity);
    setEditGuestAccess(room.guestAccess);
    setEditIsActive(room.isActive);
  }

  async function handleUpdate(roomId: string) {
    setLoading(true);
    setError("");

    const result = await updateRoomAction(roomId, {
      name: editName,
      description: editDescription,
      capacity: editCapacity,
      guestAccess: editGuestAccess,
      isActive: editIsActive,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("อัพเดทห้องสำเร็จ!");
      setEditingId(null);
      window.location.reload();
    }
    setLoading(false);
  }

  async function handleDelete(roomId: string) {
    if (!confirm("ยืนยันการลบห้องนี้?")) return;

    const result = await deleteRoomAction(roomId);
    if (result.error) {
      setError(result.error);
    } else {
      setRooms(rooms.filter((r) => r.id !== roomId));
      setSuccess("ลบห้องสำเร็จ!");
    }
  }

  function goBackOneLevel() {
    if (selectedFloor) {
      setSelectedFloor(null);
      return;
    }
    if (selectedBuilding) {
      setSelectedBuilding(null);
    }
  }

  const stage: "building" | "floor" | "room" = !selectedBuilding
    ? "building"
    : !selectedFloor
      ? "floor"
      : "room";

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">จัดการห้อง</h1>
          <p className="text-sm text-gray-500 mt-1">
            {!selectedBuilding
              ? "เลือกอาคาร"
              : !selectedFloor
                ? `อาคาร ${selectedBuilding}: เลือกชั้น`
                : `อาคาร ${selectedBuilding} • ชั้น ${selectedFloor}: เลือกห้อง`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stage !== "building" && (
            <button onClick={goBackOneLevel} className="btn-secondary">
              <ChevronLeft className="h-4 w-4" />
              ย้อนกลับ
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            เพิ่มห้อง
          </button>
        </div>
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

      {/* Create Room */}
      {showCreate && (
        <div className="card mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">
              <DoorOpen className="inline h-5 w-5 mr-2" />
              เพิ่มห้องใหม่
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
                <label className="label">ชื่อห้อง</label>
                <input
                  type="text"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น ห้องประชุม A"
                  required
                />
              </div>
              <div>
                <label className="label">รหัสห้อง (Room Code)</label>
                <input
                  type="text"
                  className="input"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  placeholder="เช่น ROOM-A1"
                  required
                />
              </div>
              <div>
                <label className="label">รายละเอียด</label>
                <input
                  type="text"
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="รายละเอียดห้อง"
                />
              </div>
              <div>
                <label className="label">ความจุ (คน)</label>
                <input
                  type="number"
                  className="input"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  min="0"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={guestAccess}
                onChange={(e) => setGuestAccess(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-(--color-primary)"
              />
              <span className="text-sm">อนุญาต Guest เข้าใช้ห้องนี้</span>
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "กำลังสร้าง..." : "สร้างห้อง"}
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

      {/* Building Step */}
      {stage === "building" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buildingSummaries.map((item) => (
            <button
              key={item.building}
              type="button"
              className="card text-left hover:shadow-md transition-shadow"
              onClick={() => {
                setSelectedBuilding(item.building);
                setSelectedFloor(null);
                setEditingId(null);
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">อาคาร</p>
                  <h3 className="font-semibold text-lg">{item.building}</h3>
                </div>
                <span className="badge bg-gray-100 text-gray-700">
                  {item.count} ห้อง
                </span>
              </div>
            </button>
          ))}

          {buildingSummaries.length === 0 && (
            <div className="col-span-full card text-center text-gray-500 py-8">
              <DoorOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>ยังไม่มีข้อมูลอาคาร</p>
            </div>
          )}
        </div>
      )}

      {/* Floor Step */}
      {stage === "floor" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {floorSummaries.map((item) => (
            <button
              key={item.floor}
              type="button"
              className="card text-left hover:shadow-md transition-shadow"
              onClick={() => {
                setSelectedFloor(item.floor);
                setEditingId(null);
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">ชั้น</p>
                  <h3 className="font-semibold text-lg">
                    {item.floor === "OTHER" ? "OTHER" : `ชั้น ${item.floor}`}
                  </h3>
                </div>
                <span className="badge bg-gray-100 text-gray-700">
                  {item.count} ห้อง
                </span>
              </div>
            </button>
          ))}

          {floorSummaries.length === 0 && (
            <div className="col-span-full card text-center text-gray-500 py-8">
              <DoorOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>ไม่พบข้อมูลชั้นของอาคารนี้</p>
            </div>
          )}
        </div>
      )}

      {/* Rooms Cards Step */}
      {stage === "room" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleRooms.map((room) => (
            <div key={room.id} className="card">
              {editingId === room.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    className="input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <input
                    type="text"
                    className="input"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="รายละเอียด"
                  />
                  <input
                    type="number"
                    className="input"
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(Number(e.target.value))}
                    min="0"
                  />
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={editGuestAccess}
                      onChange={(e) => setEditGuestAccess(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Guest Access
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="h-4 w-4"
                    />
                    เปิดใช้งาน
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(room.id)}
                      className="btn-primary text-xs py-1.5"
                      disabled={loading}
                    >
                      <Check className="h-3 w-3" /> บันทึก
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="btn-secondary text-xs py-1.5"
                    >
                      <X className="h-3 w-3" /> ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{room.name}</h3>
                      <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                        {room.roomCode}
                      </code>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(room)}
                        className="p-1.5 text-gray-400 hover:text-(--color-secondary)"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(room.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {room.description && (
                    <p className="text-sm text-gray-500 mb-2">
                      {room.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="badge bg-gray-100 text-gray-700">
                      ความจุ: {room.capacity} คน
                    </span>
                    <span
                      className={`badge ${room.guestAccess ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    >
                      Guest: {room.guestAccess ? "✓" : "✗"}
                    </span>
                    <span
                      className={`badge ${room.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {room.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Gate URL: /gate/{room.roomCode}
                  </p>
                </>
              )}
            </div>
          ))}
          {visibleRooms.length === 0 && (
            <div className="col-span-full card text-center text-gray-500 py-8">
              <DoorOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>ยังไม่มีห้องในชั้นนี้</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
