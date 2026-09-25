"use client";

import { useMinuteClock } from "@/hooks/use-minute-clock";
import { hoursLabel, openStatus } from "@/lib/open-hours";

/**
 * The venue's listed closing time read against the Dubai clock, live.
 * Before hydration (and whenever the listing proves nothing about now) it is
 * just the listing, so the server render never guesses at the time.
 */
export default function OpenStatus({ openTill, className }: { openTill: string; className?: string }) {
  const now = useMinuteClock();
  const hours = hoursLabel(openTill);
  if (!hours) return null;
  const status = now ? openStatus(openTill, now) : null;
  const text =
    status?.kind === "closed" ? `Closed now. Usually ${hours.charAt(0).toLowerCase()}${hours.slice(1)}`
    : status?.kind === "closing-soon" ? status.label
    : hours;
  return <span className={className}>{text}</span>;
}
