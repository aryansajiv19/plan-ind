"use client";

import { useTonight } from "@/hooks/use-tonight";
import type { Plan, Spot } from "@/lib/types";
import { dubaiMinuteOfDay } from "@/lib/dubai-phase";

/**
 * Tonight at a glance: open at the start time, cost, age rule, weather,
 * booking, leave-by and friends who've been, one line each (lib/tonight.ts).
 * Unstyled; the lead styles it. `data-warn` marks a line worth a second look.
 */
export default function TonightPanel({ plan, winner, coming }: { plan: Plan; winner: Spot; coming: number }) {
  const rows = useTonight({ plan, winner, coming });
  const heading = glanceHeading(plan.event_time);
  return (
    <section className="tonight-panel" aria-labelledby="tonight-title">
      <h2 id="tonight-title">{heading}</h2>
      <dl>
        {rows.map((row) => (
          <div key={row.key} className="tonight-panel__row" data-key={row.key} data-warn={row.warn ? "1" : undefined}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// "Tonight", "Tomorrow" or the weekday, from the plan's Dubai date, so an
// 11am brunch next Saturday doesn't read "Tonight".
function glanceHeading(eventTime: string | null): string {
  if (!eventTime) return "At a glance";
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  const event = new Date(eventTime);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (day(event) === day(today)) return dubaiMinuteOfDay(event) >= 17 * 60 ? "Tonight at a glance" : "Today at a glance";
  if (day(event) === day(tomorrow)) return "Tomorrow at a glance";
  return `${event.toLocaleDateString("en-GB", { timeZone: "Asia/Dubai", weekday: "long" })} at a glance`;
}
