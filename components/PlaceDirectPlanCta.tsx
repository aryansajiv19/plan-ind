"use client";

import { useState } from "react";
import DirectPlanForm, { type DirectPlanSpot } from "@/components/DirectPlanForm";

/**
 * SPECS.md §10.1's primary entry point: "Plan it here, skip the vote" — a
 * ghost-weight secondary CTA on the place page, not competing with the
 * page's existing primary actions (booking/maps). Reveals DirectPlanForm
 * inline rather than navigating away, so the spot stays visible above it.
 */
export default function PlaceDirectPlanCta({ spot }: { spot: DirectPlanSpot }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="place-action place-action--secondary">
        Plan it here, skip the vote
      </button>
    );
  }

  return (
    <div className="direct-plan-reveal">
      <DirectPlanForm spot={spot} onCancel={() => setOpen(false)} />
    </div>
  );
}
