// Trailing-throttle for Realtime-driven refetches. Every subscriber on a plan
// receives every vote/rsvp/rating event, so refetching per event is
// events x subscribers reads — N² for a group voting at once. This collapses
// a burst into one run per `waitMs`, with at most one run in flight: an event
// that lands mid-run schedules exactly one more run after it settles, so the
// last write is always picked up.
//
// The window is not reset by later events (that would be a debounce, and a
// busy room could starve it), so latency stays bounded at ~waitMs + one read.
// Staleness between overlapping runs is still the caller's job — the vote
// page's per-kind sequence guards keep doing that.

export type Coalesced = { (): void; cancel: () => void };

export function coalesce(run: () => Promise<unknown>, waitMs = 250): Coalesced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let again = false;
  let cancelled = false;

  const fire = () => {
    timer = null;
    inFlight = true;
    void Promise.resolve()
      .then(run)
      .catch(() => undefined) // a failed refetch keeps the last good rows
      .finally(() => {
        inFlight = false;
        if (again) { again = false; trigger(); }
      });
  };

  const trigger = () => {
    if (cancelled) return;
    if (inFlight) { again = true; return; }
    if (timer === null) timer = setTimeout(fire, waitMs);
  };

  return Object.assign(trigger, {
    cancel: () => {
      cancelled = true;
      again = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  });
}
