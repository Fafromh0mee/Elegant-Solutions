"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { searchRoomFinderAction } from "@/actions/room-finder";
import {
  getSlotDefinition,
  toAcademicDateString,
} from "@/lib/academic-slots";
import type { AvailableNowContext } from "@/lib/available-now";
import type { AcademicSlot } from "@/lib/types";
import {
  nextResultLimit,
  ROOM_FINDER_SHORTLIST,
  roomFinderHref,
  validateRoomFinderQuery,
  type RoomFinderFormValues,
  type RoomFinderQuery,
  type RoomFinderSearchState,
  type RoomFinderSetup,
} from "@/lib/room-finder";
import { RoomFinderForm } from "./room-finder-form";
import { RoomFinderResults } from "./room-finder-results";

type Props =
  | {
      /** /rooms: each search is a navigation, results are rendered by the server. */
      mode: "url";
      setup: RoomFinderSetup;
      initialForm: RoomFinderFormValues;
      search: RoomFinderSearchState | null;
    }
  | {
      /** Dashboard: search in place via a server action; the page never changes. */
      mode: "inline";
      setup: RoomFinderSetup;
      initialForm: RoomFinderFormValues;
      /** Server-loaded results for initialForm (current slot on dashboard entry). */
      initialSearch: RoomFinderSearchState | null;
      /** Where "now" was when the page loaded: current-slot banner or out-of-slot message. */
      now: AvailableNowContext;
    };

/** The one Room Finder (form + results), shared by /rooms and the student dashboard. */
export function RoomFinderPanel(props: Props) {
  return props.mode === "url" ? (
    <UrlPanel {...props} />
  ) : (
    <InlinePanel {...props} />
  );
}

function UrlPanel({
  setup,
  initialForm,
  search,
}: Extract<Props, { mode: "url" }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function selectSlot(slot: AcademicSlot) {
    if (search?.kind !== "DAY") return;
    startTransition(() =>
      router.push(roomFinderHref({ ...search.query, slots: [slot] })),
    );
  }

  return (
    <>
      <div className="card mb-6">
        <RoomFinderForm
          initial={initialForm}
          setup={setup}
          searched={search ? initialForm : null}
          pending={pending}
          onSearch={(query) =>
            startTransition(() => router.push(roomFinderHref(query)))
          }
        />
      </div>
      <RoomFinderResults
        search={search}
        canBook={setup.canBook}
        onSelectSlot={setup.canBook ? undefined : selectSlot}
      />
    </>
  );
}

function InlinePanel({
  setup,
  initialForm,
  initialSearch,
  now,
}: Extract<Props, { mode: "inline" }>) {
  // The form is re-seeded (remounted) when "ใช้คาบถัดไป" changes its date/slot.
  const [formSeed, setFormSeed] = useState({ key: 0, values: initialForm });
  const [search, setSearch] = useState<RoomFinderSearchState | null>(
    initialSearch,
  );
  const [searched, setSearched] = useState<RoomFinderFormValues | null>(
    initialSearch ? initialForm : null,
  );
  // The page-load "now" state stays until the student runs a search of their own.
  const [notice, setNotice] = useState<AvailableNowContext | null>(now);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);

  async function runSearch(
    query: RoomFinderQuery,
    values: RoomFinderFormValues,
    limit: number,
    keepNotice: boolean,
  ) {
    const id = ++requestId.current;
    setPending(true);
    let next: RoomFinderSearchState;
    try {
      next = await searchRoomFinderAction(query, limit);
    } catch {
      next = { kind: "FAILED" };
    }
    if (id !== requestId.current) return; // a newer search superseded this one
    setSearch(next);
    setSearched(values);
    if (!keepNotice) setNotice(null);
    setPending(false);
  }

  // "ใช้คาบถัดไป" (and a free-slot chip, when the viewer cannot book): put that slot in the form and search it.
  function searchSlot(date: string, slot: AcademicSlot) {
    const values = { ...(searched ?? formSeed.values), date, slots: [slot] };
    setFormSeed((seed) => ({ key: seed.key + 1, values }));
    const clock = new Date();
    const outcome = validateRoomFinderQuery(values, {
      today: toAcademicDateString(clock),
      now: clock,
    });
    if (!outcome.ok) {
      setSearch({ kind: "INVALID", error: outcome.error });
      setNotice(null);
      return;
    }
    void runSearch(outcome.query, values, ROOM_FINDER_SHORTLIST, false);
  }

  // "ดูห้องเพิ่มเติม" / "แสดงเพิ่ม": the same query again with a larger limit, in the same result area.
  const showMore =
    (search?.kind === "DONE" || search?.kind === "DAY") && searched
      ? () =>
          void runSearch(
            search.query,
            searched,
            nextResultLimit(search.limit),
            true,
          )
      : undefined;

  const outOfSlot = notice && notice.kind !== "IN_SLOT" ? notice : null;
  return (
    <>
      <div className="card mb-6">
        <RoomFinderForm
          key={formSeed.key}
          initial={formSeed.values}
          setup={setup}
          searched={searched}
          pending={pending}
          onSearch={(query, values) =>
            void runSearch(query, values, ROOM_FINDER_SHORTLIST, false)
          }
        />
      </div>
      <div
        className={pending ? "opacity-60 transition-opacity" : undefined}
        aria-busy={pending}
      >
        {outOfSlot ? (
          <OutOfSlot context={outOfSlot} onUseNextSlot={searchSlot} />
        ) : (
          <RoomFinderResults
            search={search}
            canBook={setup.canBook}
            showPermalink
            paging={{ onShowMore: showMore, loading: pending }}
            onSelectSlot={
              search?.kind === "DAY" && !setup.canBook
                ? (slot) => searchSlot(search.query.date, slot)
                : undefined
            }
          />
        )}
      </div>
    </>
  );
}

function OutOfSlot({
  context,
  onUseNextSlot,
}: {
  context: Exclude<AvailableNowContext, { kind: "IN_SLOT" }>;
  onUseNextSlot: (date: string, slot: AcademicSlot) => void;
}) {
  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-gray-800">
          {context.kind === "BETWEEN"
            ? "ขณะนี้อยู่นอกช่วงคาบที่เปิดให้ใช้ห้อง"
            : "วันนี้ไม่มีคาบเหลือแล้ว"}
        </p>
        <p className="text-sm text-gray-500">
          {context.kind === "BETWEEN"
            ? `คาบถัดไป: ${getSlotDefinition(context.nextSlot).label} เริ่ม ${getSlotDefinition(context.nextSlot).startTime} · หรือเลือกวันที่และคาบเองด้านบน`
            : "เลือกวันที่และคาบที่ต้องการด้านบน แล้วกด “ค้นหาห้อง”"}
        </p>
      </div>
      {context.kind === "BETWEEN" && (
        <button
          type="button"
          onClick={() => onUseNextSlot(context.today, context.nextSlot)}
          className="btn-secondary w-full sm:w-auto"
        >
          <ArrowRight className="h-4 w-4" />
          ใช้คาบถัดไป
        </button>
      )}
    </div>
  );
}
