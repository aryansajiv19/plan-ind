"use client";

import { useState } from "react";
import { googleCalUrl, icsHref } from "@/lib/calendar";
import type { Spot } from "@/lib/types";

// The sample's time, forecast, booking and calendar. The forecast is a fixed
// sample line, labelled so: /api/weather is for signed-in members only. Booking mirrors BookingSection's
// markup, held in local state: a claim here books nothing and tells nobody,
// and says so. The calendar links are real.
export default function DemoBooking({ winner, title, eventTime }: { winner: Spot; title: string; eventTime: string }) {
  const [booking, setBooking] = useState<"open" | "mine" | "booked">("open");
  const plan = { id: "sample", title, event_time: eventTime };
  const planUrl = `${typeof window === "undefined" ? "" : window.location.origin}/demo/vote`;
  const gcal = googleCalUrl(plan, winner, planUrl);
  const ics = icsHref(plan, winner, planUrl);
  const when = new Date(eventTime).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dubai" });
  const button = "vote-result__button px-4 py-2 text-sm font-display";

  return (
    <>
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">When</p>
        <p className="mt-1 text-sm font-medium">{when}, Dubai time</p>
        <p className="mt-1 text-sm text-muted">29°C, clear, light breeze. Comfortable outdoors. <span className="text-xs">Sample forecast</span></p>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Booking · sample, nothing is booked</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {booking === "booked" ? (
            <>
              <span className="vote-result__booked rounded-full bg-mint/15 px-3 py-1.5 text-sm font-bold text-mint">Booked by you</span>
              <button type="button" onClick={() => setBooking("mine")} className={button}>Unmark booked</button>
            </>
          ) : booking === "mine" ? (
            <>
              <span className="text-sm font-medium">You’re booking it.</span>
              <button type="button" onClick={() => setBooking("booked")} className={button}>Mark as booked</button>
              <button type="button" onClick={() => setBooking("open")} className={button}>I can’t book after all</button>
            </>
          ) : (
            <button type="button" onClick={() => setBooking("mine")} className={button}>I’ll book it</button>
          )}
        </div>
        <p role="status" className="mt-2 text-sm text-muted">
          {booking === "open" ? "One person claims the booking, so four people don’t all call the venue." : "On a real plan the whole group sees this change live."}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4 text-sm font-bold">
        {gcal && <a href={gcal} target="_blank" rel="noopener noreferrer" className="text-grape underline">Add to Google Calendar</a>}
        {ics && <a href={ics} download={`${winner.name}.ics`} className="text-grape underline">Download .ics</a>}
      </div>
    </>
  );
}
