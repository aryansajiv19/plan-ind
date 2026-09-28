"use client";

import { useTonight } from "@/hooks/use-tonight";
import type { Plan, Spot } from "@/lib/types";

/**
 * Tonight at a glance: open at the start time, cost, age rule, weather,
 * booking, leave-by and friends who've been, one line each (lib/tonight.ts).
 * Unstyled; the lead styles it. `data-warn` marks a line worth a second look.
 */
export default function TonightPanel({ plan, winner, coming }: { plan: Plan; winner: Spot; coming: number }) {
  const rows = useTonight({ plan, winner, coming });
  return (
    <section className="tonight-panel" aria-labelledby="tonight-title">
      <h2 id="tonight-title">Tonight at a glance</h2>
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
