"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Maximize, NotebookText } from "lucide-react";

// Presentation shell: a fixed 1280x720 (16:9) stage scaled to fit the window, so the
// product components inside render at their real size and simply scale up on a
// projector. Keys: ←/→, PageUp/PageDown (clickers), Space, Home/End, F fullscreen,
// N speaker notes. The slide index is kept in the URL hash (#1..#n).

const STAGE_W = 1280;
const STAGE_H = 720;

export interface DeckSlide {
  id: string;
  notes: string;
  content: ReactNode;
}

export function SlideDeck({ slides }: { slides: DeckSlide[] }) {
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, next));
      setIndex(clamped);
      history.replaceState(null, "", `#${clamped + 1}`);
    },
    [slides.length]
  );

  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useLayoutEffect(() => {
    const syncFromHash = () => {
      const fromHash = Number(window.location.hash.slice(1));
      if (Number.isInteger(fromHash) && fromHash >= 1 && fromHash <= slides.length) setIndex(fromHash - 1);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [slides.length]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "Home") go(0);
      else if (event.key === "End") go(slides.length - 1);
      else if (event.key === "f" || event.key === "F") toggleFullscreen();
      else if (event.key === "n" || event.key === "N") setShowNotes((value) => !value);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, slides.length]);

  useEffect(() => {
    function reveal() {
      setChromeVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setChromeVisible(false), 2500);
    }
    reveal();
    window.addEventListener("mousemove", reveal);
    return () => {
      window.removeEventListener("mousemove", reveal);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-200">
      <div
        className="absolute top-1/2 left-1/2 overflow-hidden bg-(--color-bg) shadow-sm transition-opacity duration-200"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale || 1})`,
          opacity: scale ? 1 : 0,
        }}
      >
        {slides.map((slide, i) => (
          <section
            key={slide.id}
            aria-hidden={i !== index}
            inert={i !== index}
            className={`absolute inset-0 transition-opacity duration-200 ${i === index ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            {slide.content}
          </section>
        ))}
      </div>

      {showNotes && (
        <div className="absolute inset-x-4 bottom-16 mx-auto max-h-[65vh] max-w-3xl overflow-auto rounded-xl border bg-white/95 p-4 text-sm leading-relaxed text-gray-800 shadow-sm">
          <p className="mb-1 text-xs font-medium text-gray-500">บันทึกผู้บรรยาย · {index + 1}/{slides.length}</p>
          <p className="whitespace-pre-line">{slides[index].notes}</p>
        </div>
      )}

      <div
        className={`absolute right-4 bottom-4 flex items-center gap-1 rounded-lg border bg-white/90 p-1 text-sm text-gray-700 shadow-sm transition-opacity duration-200 ${chromeVisible ? "opacity-100" : "opacity-0"}`}
      >
        <button type="button" className="rounded-md p-1.5 hover:bg-gray-100" onClick={() => go(index - 1)} aria-label="สไลด์ก่อนหน้า">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center tabular-nums">
          {index + 1} / {slides.length}
        </span>
        <button type="button" className="rounded-md p-1.5 hover:bg-gray-100" onClick={() => go(index + 1)} aria-label="สไลด์ถัดไป">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`rounded-md p-1.5 hover:bg-gray-100 ${showNotes ? "text-(--color-primary)" : ""}`}
          onClick={() => setShowNotes((value) => !value)}
          aria-label="บันทึกผู้บรรยาย (N)"
        >
          <NotebookText className="h-4 w-4" />
        </button>
        <button type="button" className="rounded-md p-1.5 hover:bg-gray-100" onClick={toggleFullscreen} aria-label="เต็มจอ (F)">
          <Maximize className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}
