"use client";

import FoldersSection from "@/components/account/FoldersSection";
import MoodboardsSection from "@/components/account/MoodboardsSection";
import PlaceLinkImporter from "@/components/PlaceLinkImporter";
import type { MoodboardsState } from "@/components/account/useMoodboards";
import type { PlanPrefill } from "@/lib/board-plan";

// Everything you keep, in one place: folders on top, then your boards, then
// the links you've saved from Instagram, TikTok and the rest.
export default function SavedTab({
  personId,
  boards,
  age,
  onPlanFromBoard,
}: {
  personId: string | null;
  boards: MoodboardsState;
  age: number;
  onPlanFromBoard: (prefill: PlanPrefill) => void;
}) {
  return (
    <section className="demo-view saved-view" aria-labelledby="saved-title">
      <header className="demo-view__header">
        <div><h1 id="saved-title">Saved.</h1></div>
        <p>Your folders, boards and saved links. Keep a place now, plan it later.</p>
      </header>
      {personId && <FoldersSection personId={personId} />}
      <MoodboardsSection boards={boards} age={age} onPlanFromBoard={onPlanFromBoard} />
      <PlaceLinkImporter />
    </section>
  );
}
