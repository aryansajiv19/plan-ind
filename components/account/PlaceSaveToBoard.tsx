"use client";

import { useState } from "react";
import SaveToBoard from "@/components/account/SaveToBoard";
import useMoodboards from "@/components/account/useMoodboards";
import type { BoardSpot } from "@/lib/social";

/**
 * The place page's "Save to board". The page has no profile id, so it lists
 * boards through RLS alone and saves to existing ones; a first board is made
 * in Discover. Boards load when the control is first opened, not per view.
 */
export default function PlaceSaveToBoard({ spot }: { spot: BoardSpot }) {
  const [wanted, setWanted] = useState(false);
  const boards = useMoodboards(null, wanted);
  return <SaveToBoard spot={spot} boards={boards} onOpen={() => setWanted(true)} />;
}
