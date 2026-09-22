"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { createGroupAction, getMyOwnedGroupsAction, type OwnedGroupSummary } from "@/actions/groups";
import { previewGroupBookingAction } from "@/actions/room-booking";
import type { BookingReviewState } from "@/lib/room-booking";
import type { BookingParticipantSelection } from "@/lib/room-booking-rules";
import { getBookingErrorMessage } from "@/lib/ui-terms";
import { ConfirmBookingButton } from "./confirm-booking-button";

type ReadyReview = Extract<BookingReviewState, { kind: "READY" }>;

/**
 * "จองสำหรับ": everything that depends on WHO the booking is for - the solo/group
 * toggle, the group picker, "+ สร้างกลุ่มใหม่", and the confirm section. Room facts
 * that never change with participant mode (name, date, time, location, capability,
 * room capacity) stay server-rendered on the page above this panel.
 *
 * Selecting or refreshing a group is a live re-preview (previewGroupBookingAction),
 * never automatic/on a timer - only in response to the student's own action. The
 * preview's fingerprint is echoed back on confirm; if live membership has moved on
 * since, the server rejects with GROUP_MEMBERSHIP_CHANGED instead of silently
 * booking a roster nobody reviewed (see lib/room-booking.ts resolveParticipants).
 */
export function BookingParticipantsPanel({
  roomId,
  searchParams,
  initialReview,
  initialGroups,
}: {
  roomId: string;
  searchParams: Record<string, string | string[] | undefined>;
  initialReview: ReadyReview;
  initialGroups: OwnedGroupSummary[];
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"SELF" | "GROUP">("SELF");
  const [groups, setGroups] = useState(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialGroups[0]?.id ?? null);
  const [review, setReview] = useState<ReadyReview>(initialReview);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreatedCode, setJustCreatedCode] = useState<string | null>(null);

  function preview(participants: BookingParticipantSelection) {
    setPreviewError(null);
    startTransition(async () => {
      const result = await previewGroupBookingAction({ roomId, searchParams, participants });
      if (result.kind === "READY") {
        setReview(result);
      } else if (result.kind === "INVALID") {
        setPreviewError(getBookingErrorMessage(result.error));
      } else {
        setPreviewError("ไม่สามารถตรวจสอบกลุ่มนี้ได้ กรุณาลองใหม่อีกครั้ง");
      }
    });
  }

  function selectSelf() {
    setMode("SELF");
    setPreviewError(null);
    setReview(initialReview);
  }

  function selectGroup(groupId: string) {
    setMode("GROUP");
    setSelectedGroupId(groupId);
    preview({ kind: "GROUP", groupId });
  }

  function refreshGroup() {
    if (selectedGroupId) preview({ kind: "GROUP", groupId: selectedGroupId });
  }

  async function submitNewGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    setCreateError(null);
    const result = await createGroupAction({ name });
    if ("error" in result) {
      setCreateError(result.error ?? "เกิดข้อผิดพลาด");
      return;
    }
    const created: OwnedGroupSummary = { id: result.group.id, name: result.group.name, code: result.group.code, memberCount: 1 };
    setGroups((current) => [created, ...current]);
    setNewGroupName("");
    setShowCreateGroup(false);
    setJustCreatedCode(created.code);
    // Re-list from the server too, so member count etc. stay authoritative going forward.
    void getMyOwnedGroupsAction().then((res) => setGroups(res.groups));
    selectGroup(created.id);
  }

  const requiresApproval = review.room.approvalPolicy === "MANUAL";
  const busy = pending;

  return (
    <div className="mt-6 border-t pt-5">
      <p className="label mb-2">จองสำหรับ</p>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={selectSelf}
          className={mode === "SELF" ? "btn-primary" : "btn-secondary"}
          disabled={busy}
        >
          ฉันคนเดียว
        </button>
        <button
          type="button"
          onClick={() => (selectedGroupId ? selectGroup(selectedGroupId) : setMode("GROUP"))}
          className={mode === "GROUP" ? "btn-primary" : "btn-secondary"}
          disabled={busy}
        >
          <Users className="h-4 w-4" />
          กลุ่ม
        </button>
      </div>

      {mode === "GROUP" && (
        <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input w-auto"
                value={selectedGroupId ?? ""}
                onChange={(e) => selectGroup(e.target.value)}
                disabled={busy}
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.memberCount} คน)
                  </option>
                ))}
              </select>
              <button type="button" onClick={refreshGroup} disabled={busy || !selectedGroupId} className="btn-secondary">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                รีเฟรชรายชื่อสมาชิก
              </button>
            </div>
          )}

          {!showCreateGroup ? (
            <button type="button" onClick={() => setShowCreateGroup(true)} className="text-sm font-medium text-blue-700 hover:underline">
              <Plus className="inline h-3.5 w-3.5" /> สร้างกลุ่มใหม่
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                className="input w-auto"
                placeholder="ชื่อกลุ่ม"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                maxLength={100}
              />
              <button type="button" onClick={submitNewGroup} className="btn-secondary">
                สร้างกลุ่ม
              </button>
              <button type="button" onClick={() => setShowCreateGroup(false)} className="text-sm text-gray-500 hover:underline">
                ยกเลิก
              </button>
            </div>
          )}
          {createError && <p className="text-sm text-red-700">{createError}</p>}
          {justCreatedCode && (
            <p className="text-sm text-green-700">
              สร้างกลุ่มสำเร็จ - รหัสกลุ่ม: <span className="font-mono font-semibold">{justCreatedCode}</span> แชร์รหัสนี้ให้เพื่อนเพื่อเข้าร่วมกลุ่ม
            </p>
          )}
        </div>
      )}

      <div className="mb-4 text-sm">
        <p>
          <span className="font-semibold text-gray-900">จำนวนผู้เข้าร่วม: {review.participantCount} คน</span>
          {review.groupName && <span className="text-gray-500"> ({review.groupName})</span>}
        </p>
        {mode === "SELF" && review.handoff.partySize > 1 && (
          <p className="mt-1 text-xs text-gray-500">
            การจองนี้จะเป็นของคุณเพียงคนเดียว (1 คน) - หากต้องการจองสำหรับกลุ่ม กรุณาเลือก “กลุ่ม” ด้านบน
          </p>
        )}
        {!review.blocked && (
          <p className="mt-1 text-xs text-gray-500">
            จองเพิ่มได้อีก <span className="font-semibold text-green-700">{review.remainingCapacity}</span> ที่ (ค้นหาสำหรับ{" "}
            {review.handoff.partySize} คน) - ระบบจะตรวจสอบอีกครั้งเมื่อกดยืนยัน
          </p>
        )}
      </div>

      {previewError && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {previewError}
        </div>
      )}

      {review.existing?.kind === "SAME" ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p>คุณจองห้องนี้ในช่วงเวลานี้ไว้แล้ว</p>
          <Link
            href={`/bookings/${encodeURIComponent(review.existing.bookingId)}`}
            className="mt-1 inline-block font-medium text-blue-700 hover:underline"
          >
            ดูการจองของคุณ
          </Link>
        </div>
      ) : review.blocked ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {getBookingErrorMessage(review.blocked, review.blockedParticipantName ?? review.remainingCapacity)}
          </p>
          <Link href={review.backHref} className="mt-2 inline-block font-medium text-blue-700 hover:underline">
            กลับไปค้นหาห้อง
          </Link>
        </div>
      ) : (
        <>
          {requiresApproval && (
            <p className="mb-3 flex items-center gap-1 text-sm text-amber-800">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              ห้องนี้ต้องได้รับการอนุมัติจากผู้ดูแลระบบ คำขอจะอยู่ในสถานะ “รออนุมัติ” จนกว่าจะได้รับการพิจารณา
            </p>
          )}
          {!requiresApproval && mode === "GROUP" && (
            <p className="mb-3 flex items-center gap-1 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              ตรวจสอบสมาชิกกลุ่มแล้ว พร้อมยืนยันการจอง
            </p>
          )}
          <ConfirmBookingButton
            handoff={review.handoff}
            participants={review.participants}
            requiresApproval={requiresApproval}
            disabled={busy}
            backHref={review.backHref}
          />
        </>
      )}
    </div>
  );
}
