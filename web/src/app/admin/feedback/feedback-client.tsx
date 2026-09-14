"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  Mail,
  Star,
  Inbox,
  Heart,
  Palette,
  Zap,
  Shield,
  BookOpen,
} from "lucide-react";
import { markContactMessageReadAction } from "@/actions/feedback";
import { AdminPageHeader } from "@/components/admin-page-header";

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
};

type SurveyResponse = {
  id: string;
  overallRating: number | null;
  designRating: number | null;
  speedRating: number | null;
  securityRating: number | null;
  contentRating: number | null;
  comment: string | null;
  createdAt: Date;
};

type Averages = {
  overall: number | null;
  design: number | null;
  speed: number | null;
  security: number | null;
  content: number | null;
};

const RATING_FIELDS: Array<{
  key: keyof Averages;
  field: keyof Pick<
    SurveyResponse,
    "overallRating" | "designRating" | "speedRating" | "securityRating" | "contentRating"
  >;
  label: string;
  icon: ReactNode;
}> = [
  { key: "overall", field: "overallRating", label: "ความพึงพอใจโดยรวม", icon: <Heart className="h-4 w-4" /> },
  { key: "design", field: "designRating", label: "การออกแบบ", icon: <Palette className="h-4 w-4" /> },
  { key: "speed", field: "speedRating", label: "ความเร็ว", icon: <Zap className="h-4 w-4" /> },
  { key: "security", field: "securityRating", label: "ความปลอดภัย", icon: <Shield className="h-4 w-4" /> },
  { key: "content", field: "contentRating", label: "เนื้อหา", icon: <BookOpen className="h-4 w-4" /> },
];

export function FeedbackClient({
  initialMessages,
  initialResponses,
  initialAverages,
  initialTotal,
}: {
  initialMessages: ContactMessage[];
  initialResponses: SurveyResponse[];
  initialAverages: Averages;
  initialTotal: number;
}) {
  const [tab, setTab] = useState<"contact" | "survey">("contact");
  const [messages, setMessages] = useState(initialMessages);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const unreadCount = messages.filter((m) => !m.isRead).length;

  function handleOpenMessage(msg: ContactMessage) {
    setExpandedId((prev) => (prev === msg.id ? null : msg.id));
    if (!msg.isRead) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m)),
      );
      startTransition(async () => {
        await markContactMessageReadAction(msg.id, true);
      });
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader />

      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("contact")}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "contact"
              ? "border-(--color-primary) text-(--color-primary)"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Mail className="h-4 w-4" />
          ข้อความติดต่อ
          {unreadCount > 0 && (
            <span className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("survey")}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "survey"
              ? "border-(--color-primary) text-(--color-primary)"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Star className="h-4 w-4" />
          แบบประเมิน
        </button>
      </div>

      {tab === "contact" ? (
        <ContactTab
          messages={messages}
          expandedId={expandedId}
          onOpen={handleOpenMessage}
        />
      ) : (
        <SurveyTab
          responses={initialResponses}
          averages={initialAverages}
          total={initialTotal}
        />
      )}
    </div>
  );
}

function ContactTab({
  messages,
  expandedId,
  onOpen,
}: {
  messages: ContactMessage[];
  expandedId: string | null;
  onOpen: (msg: ContactMessage) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="card py-12 text-center text-gray-500">
        <Inbox className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p>ยังไม่มีข้อความติดต่อเข้ามา</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          onClick={() => onOpen(msg)}
          className={`card cursor-pointer transition-colors ${
            !msg.isRead ? "border-(--color-primary)/40 bg-(--color-primary-light)/40" : ""
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-900">
                {msg.name}{" "}
                <span className="text-sm font-normal text-gray-500">
                  ({msg.email})
                </span>
                {msg.phone && (
                  <span className="text-sm font-normal text-gray-500">
                    {" "}
                    · {msg.phone}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-gray-700">{msg.subject}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!msg.isRead && (
                <span className="badge bg-red-100 text-red-600">ยังไม่อ่าน</span>
              )}
              <span className="text-xs text-gray-400">
                {new Date(msg.createdAt).toLocaleString("th-TH")}
              </span>
            </div>
          </div>
          {expandedId === msg.id && (
            <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm text-gray-700">
              {msg.message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function SurveyTab({
  responses,
  averages,
  total,
}: {
  responses: SurveyResponse[];
  averages: Averages;
  total: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {RATING_FIELDS.map((f) => (
            <div key={f.key} className="card py-4 text-center">
              <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-(--color-primary-light) text-(--color-primary)">
                {f.icon}
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {averages[f.key] !== null ? averages[f.key] : "-"}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">{f.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          จากแบบประเมินทั้งหมด {total} รายการ
        </p>
      </div>

      {responses.length === 0 ? (
        <div className="card py-12 text-center text-gray-500">
          <Star className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p>ยังไม่มีแบบประเมินส่งเข้ามา</p>
        </div>
      ) : (
        <div className="space-y-3">
          {responses.map((r) => (
            <div key={r.id} className="card">
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {RATING_FIELDS.map((f) => {
                  const value = r[f.field];
                  if (value === null) return null;
                  return (
                    <span
                      key={f.key}
                      className="inline-flex items-center gap-1 text-sm text-gray-700"
                      title={f.label}
                    >
                      {f.icon}
                      {value}/5
                    </span>
                  );
                })}
              </div>
              {r.comment && (
                <p className="text-sm text-gray-700">{r.comment}</p>
              )}
              <p className="mt-2 text-xs text-gray-400">
                {new Date(r.createdAt).toLocaleString("th-TH")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
