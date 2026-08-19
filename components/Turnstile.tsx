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

export default function Turnstile({
  onVerify,
  action,
}: {
  onVerify: (token: string) => void;
  action: "email-login" | "plan-access";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let widgetId: string | null = null;
    let cancelled = false;

    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: "auto",
        size: "flexible",
        callback: (token: string) => {
          setError(false);
          onVerify(token);
        },
        "error-callback": () => setError(true),
        "expired-callback": () => onVerify(""),
      });
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
      script.addEventListener("error", () => setError(true), { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, onVerify, siteKey]);

  if (!siteKey) {
    return process.env.NODE_ENV === "production"
      ? <p role="alert" className="auth-error">Bot protection is not configured.</p>
      : null;
  }

  return (
    <div className="turnstile-wrap">
      <div ref={containerRef} />
      {error && <p role="alert" className="auth-error">Security check failed. Reload and try again.</p>}
    </div>
  );
}
