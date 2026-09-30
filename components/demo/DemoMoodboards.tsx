"use client";

import { useState } from "react";
import MoodboardTile from "@/components/account/MoodboardTile";
import { CATEGORIES } from "@/components/categoryGroups";
import { boardPlanPrefill, type PlanPrefill } from "@/lib/board-plan";
import type { BoardSpot } from "@/lib/social";
import type { MoodboardItem } from "@/lib/types";

// P30: sample boards for the demo, built from real catalogue places (curated
// ids are fixed seeds), so "Open place" opens the real page and no photo is
// passed off as a venue it isn't. The same tile and the same "Plan from this
// board" the real Discover tab has; removing a tile only changes this screen.
const SPOTS: Record<string, BoardSpot> = {
  tresind: { id: "a0000000-0000-0000-0000-000000000005", google_place_id: "ChIJcfzwzo0TXz4RyQpaHkMBWsE", source: "curated", name: "Tresind Studio", category: "dinner", area: "Palm Jumeirah", cuisine: "Indian", price_band: "$$$", min_spend: 1350, open_till: "11pm", vibe: "Theatrical tasting menu, book weeks ahead", photo_url: null, photo_attribution: null },
  threeFils: { id: "a0000000-0000-0000-0000-000000000003", google_place_id: "ChIJc_qkbD5CXz4RjckbjFAB3eM", source: "curated", name: "3Fils", category: "dinner", area: "Jumeirah", cuisine: "Seafood", price_band: "$$", min_spend: 180, open_till: "11pm", vibe: "Marina-side, no-reservations, quietly excellent", photo_url: null, photo_attribution: null },
  greenPlanet: { id: "50000000-0000-0000-0000-000000000004", source: "curated", name: "The Green Planet", category: "outdoors", area: "City Walk", cuisine: "Indoor rainforest", price_band: "$$", min_spend: 130, open_till: "6pm", vibe: "Bio-dome jungle, sloths & birds", photo_url: "https://zyojaoyatunjwgbivaqu.supabase.co/storage/v1/object/public/spot-photos/50000000000000000000000000000004.jpg", photo_attribution: "WikiSilky / Wikimedia Commons / CC BY-SA 4.0" },
  qudra: { id: "50000000-0000-0000-0000-000000000001", google_place_id: "ChIJreY1bgCDXz4RHWEOpL59gTs", source: "curated", name: "Al Qudra Lakes", category: "outdoors", area: "Seih Al Salam", cuisine: "Desert lakes", price_band: "$", min_spend: 20, open_till: "10pm", vibe: "Cycle, picnic, flamingos at dawn", photo_url: "/venues/50000000-0000-0000-0000-000000000001.webp", photo_attribution: "JSPhotography2016 / Wikimedia Commons / CC BY-SA 4.0" },
  hatta: { id: "50000000-0000-0000-0000-000000000002", source: "curated", name: "Hatta Wadi Hub", category: "outdoors", area: "Hatta", cuisine: "Mountain activities", price_band: "$$", min_spend: 150, open_till: "6pm", vibe: "Kayaking, hikes, mountain air", photo_url: null, photo_attribution: null },
};

const item = (id: string, spot: BoardSpot, note: string | null): { item: MoodboardItem; spot: BoardSpot } => ({
  item: { id, moodboard_id: "sample", kind: "place", label: spot.name, note, storage_path: null, source_url: `/place/${spot.id}`, created_at: "2026-09-01T00:00:00Z" },
  spot,
});

export const DEMO_BOARDS = [
  { id: "sample-birthday", name: "Sara’s birthday", items: [item("b1", SPOTS.tresind, "If we can get a table"), item("b2", SPOTS.threeFils, "Backup, no booking needed")] },
  { id: "sample-weekend", name: "Weekend outside", items: [item("w1", SPOTS.qudra, "Leave before sunrise"), item("w2", SPOTS.hatta, null), item("w3", SPOTS.greenPlanet, "If it’s too hot")] },
];

const allowed = (category: string) => CATEGORIES.some((c) => c.key === category);

export default function DemoMoodboards({ onPlan }: { onPlan: (prefill: PlanPrefill) => void }) {
  const [removed, setRemoved] = useState<string[]>([]);
  return (
    <section className="demo-tool-panel demo-moodboard-panel" aria-labelledby="demo-moodboards-title">
      <div className="demo-tool-panel__head">
        <div>
          <h2 id="demo-moodboards-title">Keep the feeling, not just the venue.</h2>
        </div>
      </div>
      {DEMO_BOARDS.map((board) => {
        const items = board.items.filter((entry) => !removed.includes(entry.item.id));
        const places = items.map((entry) => entry.spot);
        return (
          <div key={board.id} className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg">{board.name}</h3>
              {places.length > 0 && (
                <button type="button" className="demo-primary-action demo-quiet-action" onClick={() => onPlan(boardPlanPrefill(board, places, allowed, `${board.id}:${Date.now()}`))}>
                  Plan from this board
                </button>
              )}
            </div>
            {items.length > 0 ? (
              <div className="board-grid mt-2">
                {items.map((entry, index) => (
                  <MoodboardTile key={entry.item.id} item={entry.item} spot={entry.spot} index={index} removing={false} onRemove={() => setRemoved((current) => [...current, entry.item.id])} />
                ))}
              </div>
            ) : <p className="wall-empty">{board.name} is empty.</p>}
          </div>
        );
      })}
    </section>
  );
}
