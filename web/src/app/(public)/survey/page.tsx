"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Star,
  Send,
  CheckCircle2,
  AlertCircle,
  Heart,
  Palette,
  Zap,
  Shield,
  BookOpen,
} from "lucide-react";
import {
  submitSurveyResponseAction,
  getSurveyStatsAction,
} from "@/actions/feedback";

type SurveyStats = {
  total: number;
  overallAverage: number | null;
  averages: {
    overall: number | null;
    design: number | null;
    speed: number | null;
    security: number | null;
    content: number | null;
  };
};

const CATEGORY_ICONS: Record<keyof SurveyStats["averages"], ReactNode> = {
  overall: <Heart className="h-4 w-4" />,
  design: <Palette className="h-4 w-4" />,
  speed: <Zap className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
  content: <BookOpen className="h-4 w-4" />,
};

export default function SurveyPage() {
  const [ratings, setRatings] = useState({
    overall: 0,
    design: 0,
    speed: 0,
    security: 0,
    content: 0,
  });
  const [hoverField, setHoverField] = useState<keyof typeof ratings | null>(
    null,
  );
  const [hoverRating, setHoverRating] = useState(0);
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const res = await getSurveyStatsAction();
    setStats(res);
    setStatsLoading(false);
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const ratingFields = [
    {
      key: "overall" as const,
      label: "ความพึงพอใจโดยรวม",
      description: "ความพึงพอใจต่อเว็บไซต์มากน้อยเพียงไร",
      icon: <Heart className="h-6 w-6" />,
    },
    {
      key: "design" as const,
      label: "การออกแบบ (UI/UX)",
      description: "ความสวยงาม และความง่ายในการใช้งาน",
      icon: <Palette className="h-6 w-6" />,
    },
    {
      key: "speed" as const,
      label: "ความเร็วในการใช้งาน",
      description: "ความรวดเร็วในการตอบสนอง",
      icon: <Zap className="h-6 w-6" />,
    },
    {
      key: "security" as const,
      label: "ความปลอดภัย",
      description: "ความปลอดภัยของข้อมูลและความน่าเชื่อถือ",
      icon: <Shield className="h-6 w-6" />,
    },
    {
      key: "content" as const,
      label: "เนื้อหาและข้อมูล",
      description: "ความถูกต้อง ครบถ้วน และเป็นประโยชน์ของเว็บไซต์",
      icon: <BookOpen className="h-6 w-6" />,
    },
  ];

  const handleRatingChange = (field: keyof typeof ratings, value: number) => {
    setRatings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const hasAtLeastOneRating = Object.values(ratings).some((r) => r > 0);
    if (!hasAtLeastOneRating) {
      setError("กรุณาให้คะแนนอย่างน้อยหนึ่งด้านก่อนส่งแบบประเมิน");
      return;
    }

    setLoading(true);
    setSuccess(false);

    const result = await submitSurveyResponseAction({
      overall: ratings.overall,
      design: ratings.design,
      speed: ratings.speed,
      security: ratings.security,
      content: ratings.content,
      comment: comments,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setRatings({ overall: 0, design: 0, speed: 0, security: 0, content: 0 });
      setHoverField(null);
      setHoverRating(0);
      setComments("");
      setTimeout(() => setSuccess(false), 4000);
      void loadStats();
    }

    setLoading(false);
  };

  return (
    <div>
      {/* Header Section */}
      <div className="bg-gradient-to-b from-(--color-primary-light) to-white py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            ประเมินเว็บไซต์
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl">
            ความคิดเห็นของคุณสำคัญต่อเรา
            โปรดแบ่งปันประสบการณ์ของคุณเกี่ยวกับระบบของเรา
          </p>
        </div>
      </div>

      {/* Survey Form Section: two-column layout */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="rounded-2xl bg-white shadow-lg p-6 border border-gray-100">
          {success && (
            <div className="mb-6 rounded-lg bg-green-50 border border-green-200 p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900">
                  ส่งแบบประเมินสำเร็จ!
                </h3>
                <p className="text-sm text-green-800 mt-1">
                  ขอบคุณสำหรับข้อเสนอแนะของคุณ
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">เกิดข้อผิดพลาด</h3>
                <p className="text-sm text-red-800 mt-1">{error}</p>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start"
          >
            {/* Left: 5 rating cards */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                โปรดให้คะแนนประสบการณ์ของคุณ
              </h2>
              {ratingFields.map((field) => (
                <div
                  key={field.key}
                  className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all"
                  onMouseEnter={() => setHoverField(field.key)}
                  onMouseLeave={() => {
                    setHoverField(null);
                    setHoverRating(0);
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-(--color-primary)">{field.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {field.label}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {field.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((i) => {
                      const isHovered =
                        hoverField === field.key && hoverRating >= i;
                      const isSelected = ratings[field.key] >= i;
                      return (
                        <button
                          key={i}
                          type="button"
                          onMouseEnter={() => setHoverRating(i)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => handleRatingChange(field.key, i)}
                          className="transition-transform transform hover:scale-110"
                          aria-label={`${i} ดาว`}
                        >
                          <Star
                            className={`h-7 w-7 ${
                              isHovered || isSelected
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-300"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: overall summary + breakdown + comments + submit */}
            <div className="flex flex-col gap-4 p-4 bg-gray-50 rounded-xl">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  ความพึงพอใจโดยรวม
                </h3>
                <div className="rounded-lg bg-white border border-gray-200 p-4 text-center">
                  {statsLoading ? (
                    <p className="py-6 text-sm text-gray-400">กำลังโหลด...</p>
                  ) : !stats || stats.total === 0 ? (
                    <p className="py-6 text-sm text-gray-500">
                      ยังไม่มีผู้ตอบแบบประเมิน เป็นคนแรกได้เลย!
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-center gap-2">
                        <div className="text-3xl font-bold text-gray-900">
                          {stats.overallAverage ?? "-"}
                        </div>
                        <div className="text-sm text-gray-600">/ 5</div>
                      </div>
                      <div className="mt-2 flex items-center justify-center gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star
                            key={i}
                            className={`h-5 w-5 ${
                              stats.overallAverage !== null &&
                              i <= Math.round(stats.overallAverage)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-200"
                            }`}
                          />
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        จากทั้งหมด {stats.total} คน
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Per-category averages, computed from real submissions */}
              {stats && stats.total > 0 && (
                <div className="border-t border-gray-200 pt-3">
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    ค่าเฉลี่ยแต่ละหมวด
                  </div>
                  <div className="space-y-2">
                    {ratingFields.map((field) => {
                      const value = stats.averages[field.key];
                      return (
                        <div key={field.key} className="flex items-center gap-2">
                          <span className="text-(--color-primary) shrink-0">
                            {CATEGORY_ICONS[field.key]}
                          </span>
                          <div className="flex-1 truncate text-xs text-gray-600">
                            {field.label}
                          </div>
                          <div className="w-12 text-right text-xs font-semibold text-gray-700">
                            {value !== null ? `${value}/5` : "-"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div className="border-t border-gray-200 pt-3 flex-1 flex flex-col">
                <label className="text-xs font-semibold text-gray-700 mb-2">
                  ความคิดเห็นเพิ่มเติม (ไม่บังคับ)
                </label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="บอกเราว่ามีสิ่งใดที่เราสามารถปรับปรุงได้..."
                  rows={5}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 transition-all resize-none flex-1"
                />
              </div>

              {/* Submit button */}
              <div className="mt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary py-3 rounded-lg font-medium flex items-center justify-center gap-2"
                >
                  {loading ? (
                    "กำลังส่ง..."
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      ยืนยัน
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Back Link */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-(--color-primary) hover:text-opacity-70 transition-all"
            >
              ← กลับไปหน้าหลัก
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
