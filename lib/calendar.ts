import type { Plan, Spot } from "./types";
import { googleMapsUrl } from "./directions.ts";

type CalendarSpot = Pick<Spot, "name" | "area" | "address" | "latitude" | "longitude" | "google_place_id">;

// Where the event is, in a form a maps app can route to (P23): the street
// address, else the coordinates, else the name and area.
function where(spot: CalendarSpot): string {
  if (spot.address) return spot.address;
  if (spot.latitude != null && spot.longitude != null) return `${spot.latitude},${spot.longitude}`;
  return `${spot.name}, ${spot.area}`;
}

// The plan to come back to, and the pin to get there.
function about(spot: CalendarSpot, planUrl: string): string {
  return `The plan: ${planUrl}\nDirections: ${googleMapsUrl(spot)}`;
}

// Compact UTC stamp for calendar formats: 2026-08-07T16:00:00Z → 20260807T160000Z
function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function window(iso: string): { start: Date; end: Date } {
  const start = new Date(iso);
  return { start, end: new Date(start.getTime() + 2 * 3_600_000) }; // 2h default
}

// "Add to Google Calendar" URL — no backend, opens a prefilled event.
export function googleCalUrl(plan: Pick<Plan, "title" | "event_time">, spot: CalendarSpot, planUrl: string): string | null {
  if (!plan.event_time) return null;
  const { start, end } = window(plan.event_time);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${spot.name}. ${plan.title}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    location: where(spot),
    details: about(spot, planUrl),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Downloadable .ics as a data URI — works with Apple Calendar / Outlook.
export function icsHref(plan: Pick<Plan, "id" | "title" | "event_time">, spot: CalendarSpot, planUrl: string): string | null {
  if (!plan.event_time) return null;
  const { start, end } = window(plan.event_time);
  // RFC 5545 TEXT (3.3.11): CRLF and a bare CR are line breaks, written as
  // \n; every other control character is not TEXT and is dropped (a tab is
  // allowed), so no value can end a line and start a property of its own.
  const esc = (s: string) => s
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/([,;\\])/g, "\\$1")
    .replace(/\n/g, "\\n");
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
    `LOCATION:${esc(where(spot))}`,
    `DESCRIPTION:${esc(about(spot, planUrl))}`,
    // Reminders the day before and two hours before. Google Calendar's
    // template URL can't carry alarms; imported .ics files keep them.
    ...["-P1D", "-PT2H"].flatMap((trigger) => [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:${trigger}`,
      `DESCRIPTION:${esc(`${spot.name}. ${plan.title}`)}`,
      "END:VALARM",
    ]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return (
    "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.join("\r\n"))
  );
}
