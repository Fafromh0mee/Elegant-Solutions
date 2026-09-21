"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchRoomFinderAction } from "@/actions/room-finder";
import {
  roomFinderHref,
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
    };

/** The full Room Finder (form + results), shared by /rooms and the student dashboard. */
export function RoomFinderPanel(props: Props) {
  return props.mode === "url" ? <UrlPanel {...props} /> : <InlinePanel {...props} />;
}

function UrlPanel({ setup, initialForm, search }: Extract<Props, { mode: "url" }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="card mb-6">
        <RoomFinderForm
          initial={initialForm}
          setup={setup}
          searched={search ? initialForm : null}
          pending={pending}
          onSearch={(query) => startTransition(() => router.push(roomFinderHref(query)))}
        />
      </div>
      <RoomFinderResults search={search} />
    </>
  );
}

function InlinePanel({ setup, initialForm }: Extract<Props, { mode: "inline" }>) {
  const [search, setSearch] = useState<RoomFinderSearchState | null>(null);
  const [searched, setSearched] = useState<RoomFinderFormValues | null>(null);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);

  async function runSearch(query: RoomFinderQuery, values: RoomFinderFormValues) {
    const id = ++requestId.current;
    setPending(true);
    let next: RoomFinderSearchState;
    try {
      next = await searchRoomFinderAction(query);
    } catch {
      next = { kind: "FAILED" };
    }
    if (id !== requestId.current) return; // a newer search superseded this one
    setSearch(next);
    setSearched(values);
    setPending(false);
  }

  return (
    <>
      <div className="card mb-6">
        <RoomFinderForm
          initial={initialForm}
          setup={setup}
          searched={searched}
          pending={pending}
          onSearch={(query, values) => void runSearch(query, values)}
        />
      </div>
      <div className={pending ? "opacity-60 transition-opacity" : undefined} aria-busy={pending}>
        <RoomFinderResults search={search} showPermalink />
      </div>
    </>
  );
}
