import type { Plan, Spot } from "./types";

// Compact UTC stamp for calendar formats: 2026-08-07T16:00:00Z → 20260807T160000Z
function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function window(iso: string): { start: Date; end: Date } {
  const start = new Date(iso);
  return { start, end: new Date(start.getTime() + 2 * 3_600_000) }; // 2h default
}

// "Add to Google Calendar" URL — no backend, opens a prefilled event.
export function googleCalUrl(plan: Plan, spot: Spot): string | null {
  if (!plan.event_time) return null;
  const { start, end } = window(plan.event_time);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${spot.name}. ${plan.title}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    location: `${spot.name}, ${spot.area}`,
    details: spot.description ?? `Decided with friends. ${spot.vibe}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Downloadable .ics as a data URI — works with Apple Calendar / Outlook.
export function icsHref(plan: Plan, spot: Spot): string | null {
  if (!plan.event_time) return null;
  const { start, end } = window(plan.event_time);
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//deal-three//EN",
    "BEGIN:VEVENT",
    `UID:${plan.id}@deal-three`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${spot.name}. ${plan.title}`)}`,
    `LOCATION:${esc(`${spot.name}, ${spot.area}`)}`,
    `DESCRIPTION:${esc(spot.description ?? spot.vibe)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return (
    "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.join("\r\n"))
  );
}
