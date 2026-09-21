import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadRoomFinder } from "@/lib/room-finder-search";
import { RoomFinderPanel } from "@/components/room-finder/room-finder-panel";

// Secondary, shareable route. The primary flow is the panel on /dashboard; this page
// renders the same panel with its state in the URL (refresh, back/forward, links).

export default async function RoomFinderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const state = await loadRoomFinder({
    role: session?.user.role ?? null,
    params: await searchParams,
    now: new Date(),
  });

  if (state.kind === "UNAUTHENTICATED") redirect("/login");

  if (state.kind === "NOT_ALLOWED") {
    return (
      <div className="card mx-auto max-w-xl text-center">
        <h1 className="text-lg font-semibold text-gray-900">ค้นหาห้อง</h1>
        <p className="mt-2 text-sm text-gray-600">
          การค้นหาและจองห้องเปิดให้เฉพาะนักศึกษาและบุคลากรของมหาวิทยาลัย
        </p>
        <Link href="/dashboard" className="btn-secondary mt-4 inline-flex">
          กลับหน้าภาพรวม
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ค้นหาห้อง</h1>
        <p className="mt-1 text-gray-500">ต้องการห้องสำหรับกี่คน เมื่อไหร่ และใช้ทำอะไร</p>
      </div>

      {/* Keyed on the URL state so back/forward resets the form to that search. */}
      <RoomFinderPanel
        key={JSON.stringify(state.form)}
        mode="url"
        setup={{ today: state.today, maxDate: state.maxDate, now: state.now, locations: state.locations }}
        initialForm={state.form}
        search={state.search}
      />
    </div>
  );
}
