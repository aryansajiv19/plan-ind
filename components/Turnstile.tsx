"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

/**
 * `loading` until the widget is on screen, `failed` if it never gets there.
 * `ready` means the challenge is rendered and waiting for the visitor — NOT
 * that it has been solved; the token arrives separately via onVerify.
 */
export type TurnstileStatus = "loading" | "ready" | "failed";

/**
 * How long to wait for a challenge to actually reach the visitor before
 * calling it failed.
 *
 * There has to be a timeout, because the worst case is not an error — it is
 * silence. Verified: in a headless context the script keeps its load event
 * pending indefinitely, so neither `load` nor `error` ever fires and a status
 * derived only from callbacks stays "loading" forever. That is what leaves a
 * real user looking at a permanently dead submit button with nothing said. An
 * adblocker or a blocked region produces the same shape.
 *
 * There are TWO ways to reach that silence, and the second one was uncovered
 * until 2026-09-20 (observed live on /login):
 *
 *   1. the script never loads      → `render()` never runs, widgetId stays null
 *   2. `render()` returns an id but Cloudflare never paints a challenge into
 *      the container — no iframe, no callback, no error-callback
 *
 * Case 2 used to be invisible because this timer was cleared the instant
 * `render()` returned. Status went to "ready", which no caller matches
 * (AuthForm and VoteState both branch on "loading" and "failed" only), so the
 * visitor got a disabled button and not one word of explanation. The timer now
 * outlives render and judges the outcome instead of the attempt.
 */
const LOAD_TIMEOUT_MS = 12_000;

export default function Turnstile({
  onVerify,
  onStatus,
  action,
}: {
  onVerify: (token: string) => void;
  /** Lets the caller explain a dead button. See AuthForm. */
  onStatus?: (status: TurnstileStatus) => void;
  action: "email-login" | "plan-access";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let widgetId: string | null = null;
    let solved = false;
    let cancelled = false;

    // Reported from real events and a timer only — never synchronously from
    // this effect body, which would be a setState-in-effect in whichever
    // parent is listening.
    const report = (status: TurnstileStatus) => {
      if (!cancelled) onStatus?.(status);
    };
    const fail = () => { setError(true); report("failed"); };
    const timer = window.setTimeout(() => {
      if (solved) return;
      // An iframe in the container means the challenge reached the visitor —
      // whether it auto-solves or waits for a click is then their business,
      // and NOT a failure. No iframe means nobody can act on anything.
      if (!widgetId || !containerRef.current?.querySelector("iframe")) fail();
    }, LOAD_TIMEOUT_MS);

    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: "auto",
        size: "flexible",
        callback: (token: string) => {
          solved = true;
          window.clearTimeout(timer);
          setError(false);
          report("ready");
          onVerify(token);
        },
        "error-callback": fail,
        // An expired token is not a failure — the widget re-challenges. Drop
        // the token so the gate closes again, and stay "ready".
        "expired-callback": () => onVerify(""),
      });
      // Deliberately NOT clearing the timer here: render() returning an id
      // only means Cloudflare accepted the call, not that a challenge ever
      // appeared. The timer is what tells those two apart.
      report("ready");
    };

    const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile-script]");
    if (existing) {
      if (window.turnstile) render();
      else existing.addEventListener("load", render, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = "true";
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", fail, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, onVerify, onStatus, siteKey]);

  if (!siteKey) {
    // Report once, asynchronously, so a caller that explains the dead button
    // is told even when the widget never mounts at all.
    if (process.env.NODE_ENV === "production") queueMicrotask(() => {
      console.error("Turnstile: NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set");
      onStatus?.("failed");
    });
    return process.env.NODE_ENV === "production"
      ? <p role="alert" className="auth-error">Sign-in isn’t available right now. Please try again later.</p>
      : null;
  }

  return (
    <div className="turnstile-wrap">
      <div ref={containerRef} />
      {/* Only when nobody upstream is handling it — otherwise the caller and
          this component say the same thing twice in different words. */}
      {error && !onStatus && (
        <p role="alert" className="auth-error">Security check failed. Reload and try again.</p>
      )}
    </div>
  );
}
