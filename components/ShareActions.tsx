"use client";

import { useSyncExternalStore, useState } from "react";
import { haptic } from "@/lib/interaction";
import { shareMessage, whatsappShareUrl } from "@/lib/share-preview";

// In Dubai the plan link travels through WhatsApp, so it leads the share row;
// the native sheet (where the browser has one) and copy-link sit beside it.
// Secondary weight: the round action above is the screen's one primary. The link itself is the plan id, which is the capability: the
// preview a recipient sees before opening it is app/plan/[id]/layout.tsx.

const noSubscribe = () => () => {};

// Read via useSyncExternalStore, not useEffect + setState (React 19 lint),
// and with a server snapshot so the SSR pass and hydration agree: the server
// renders no native-share button and no WhatsApp href, the client fills both.
function usePlanUrl(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => `${window.location.origin}${window.location.pathname}`,
    () => null,
  );
}

function useCanNativeShare(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
}

export default function ShareActions({ title }: { title: string | null }) {
  const url = usePlanUrl();
  const canShare = useCanNativeShare();
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      haptic(10);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked: leave the button unchanged
    }
  }

  async function nativeShare() {
    if (!url) return;
    try {
      await navigator.share({ title: title ?? "Deal three", text: shareMessage(title, "").trim(), url });
    } catch {
      // AbortError when the sheet is dismissed; nothing to report either way
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row" role="group" aria-label="Share this plan">
      {/* A real link, not a button that calls window.open: the WhatsApp app
          handles wa.me on a phone, and it works with scripting blocked. */}
      <a
        href={url ? whatsappShareUrl(title, url) : undefined}
        aria-disabled={url ? undefined : true}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => haptic(10)}
        className="vote-secondary-action flex-1 rounded-2xl border-2 border-ink bg-card font-display text-lg font-extrabold"
      >
        Share on WhatsApp
      </a>
      <div className="flex gap-3">
        {canShare && (
          <button
            type="button"
            onClick={nativeShare}
            className="vote-secondary-action flex-1 rounded-2xl border-2 border-ink bg-card font-display font-extrabold"
          >
            Share via…
          </button>
        )}
        <button
          type="button"
          onClick={copyLink}
          className="vote-secondary-action flex-1 rounded-2xl border-2 border-ink bg-card font-display font-extrabold"
        >
          <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
        </button>
      </div>
    </div>
  );
}
