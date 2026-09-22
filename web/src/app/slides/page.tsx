import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SlideDeck } from "@/presentation/slide-deck";
import { DECK_SLIDES } from "@/presentation/slides";
import "@/presentation/presentation.css";

// Progress-update slides, rendered from the product's own components and tokens.
// Presentation-only: available in development, and in a production build only when
// ENABLE_PRESENTATION=1. Behind the normal login like every non-public route.

// Read ENABLE_PRESENTATION at request time, not at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Elegant Solution - Progress Update",
};

export default function SlidesPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_PRESENTATION !== "1") notFound();
  return <SlideDeck slides={DECK_SLIDES} />;
}
