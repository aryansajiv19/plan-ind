"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Spot } from "@/lib/types";
import PhotoTile, { type WallNote } from "@/components/PhotoTile";

/** A pin is a non-photo card that sits IN the wall, not in a sidebar. */
export interface WallPin {
  id: string;
  kind: "pin";
  children: ReactNode;
}
export interface WallPhoto {
  id: string;
  kind: "photo";
  spot: Spot;
  note?: WallNote;
}
export type WallItem = WallPhoto | WallPin;

/** Tile heights cycle 200-360px so no two neighbouring columns rhyme. */
const HEIGHTS = [330, 250, 240, 360, 200, 300, 230, 280, 210, 270];
/** The stagger. Four columns, four different starting offsets. */
const COLUMN_OFFSETS = [0, 46, 16, 64];
const COLUMNS = 4;

/**
 * The four-column staggered wall from turn 9 / 10a.
 *
 * Two details from the handoff are load-bearing and marked as such in the CSS:
 * `minmax(0, 1fr)` on the tracks and `min-width: 0` on each column. Without
 * them an image's intrinsic aspect ratio inflates its track and the whole wall
 * overflows its container — the handoff calls this out by name because it had
 * already happened once.
 *
 * Items are dealt across columns round-robin rather than balanced by height:
 * the staggered top offsets are what create the rhythm, and a
 * shortest-column-first packer fights them by trying to level the bottoms.
 */
export default function PhotoWall({
  items,
  loading = false,
  emptyMessage = "Nothing saved yet. Places you and your friends save land here.",
}: {
  items: WallItem[];
  loading?: boolean;
  emptyMessage?: string;
}) {
  const reduced = useReducedMotion();

  if (loading) {
    return (
      <div className="wall" aria-busy="true" aria-live="polite">
        {Array.from({ length: COLUMNS }, (_, c) => (
          <div key={c} className="wall__col" style={{ marginTop: COLUMN_OFFSETS[c] }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="wall-skeleton"
                style={{ height: HEIGHTS[(c * 2 + i) % HEIGHTS.length] }}
              />
            ))}
          </div>
        ))}
        <span className="sr-only">Loading places</span>
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="wall-empty">{emptyMessage}</p>;
  }

  const columns: WallItem[][] = Array.from({ length: COLUMNS }, () => []);
  items.forEach((item, i) => columns[i % COLUMNS].push(item));

  return (
    <div className="wall">
      {columns.map((column, c) => (
        <div key={c} className="wall__col" style={{ marginTop: COLUMN_OFFSETS[c] }}>
          {column.map((item, i) => {
            const index = i * COLUMNS + c;
            return (
              <motion.div
                key={item.id}
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.55,
                  // A short stagger, capped: past ~10 tiles the tail would be
                  // waiting on an animation rather than reading the page.
                  delay: reduced ? 0 : Math.min(index * 0.04, 0.4),
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {item.kind === "photo" ? (
                  <PhotoTile
                    spot={item.spot}
                    note={item.note}
                    height={HEIGHTS[index % HEIGHTS.length]}
                    priority={index < COLUMNS}
                  />
                ) : (
                  <div className="wall-pin">{item.children}</div>
                )}
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
