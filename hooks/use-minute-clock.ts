"use client";

import { useSyncExternalStore } from "react";

// The current minute, for labels like "Closes in 40 min" that go stale on a
// page left open in a group chat. One shared 30s timer however many cards
// read it. The server snapshot is null, so SSR and hydration agree and a
// caller renders its time-free fallback until the browser takes over.

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  timer ??= setInterval(() => listeners.forEach((listener) => listener()), 30_000);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// A primitive, so the snapshot is stable between ticks within one minute.
const currentMinute = () => Math.floor(Date.now() / 60_000);
const serverMinute = () => null;

export function useMinuteClock(): Date | null {
  const minute = useSyncExternalStore(subscribe, currentMinute, serverMinute);
  return minute === null ? null : new Date(minute * 60_000);
}
