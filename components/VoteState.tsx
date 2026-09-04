"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The vote page's full-screen non-content states, in one place.
 *
 * Before this there were six near-identical hand-rolled blocks in
 * `app/plan/[id]/page.tsx`, drifting in copy and class list — and a real
 * first-touch surface for a guest arriving on a dead or paused link.
 *
 * `guest-paused` is deliberately its own kind: `bootstrapPlanAccess` returns
 * `anonymous-disabled` when the Supabase project has guest sign-ins switched
 * off, and that is our configuration, not the visitor's bad link. It must never
 * read as "you have a bad link."
 *
 * Colour: none. A state screen is not "you", not the outcome, not a category —
 * graphite ink on the inherited ground. The only fill is the "Try again" button
 * (a commit action). See FE.7 in design-system/SPECS.md.
 */
export type VoteStateKind =
  | "loading"
  | "captcha"
  | "guest-paused"
  | "retry"
  | "cold-link";

export default function VoteState({
  kind,
  planTitle,
  onRetry,
  children,
}: {
  kind: VoteStateKind;
  /** Shown in the loading copy once the plan row is known. */
  planTitle?: string | null;
  /** Required for `kind="retry"` — renders the primary "Try again" button. */
  onRetry?: () => void;
  /** `kind="captcha"` only: the <Turnstile> widget. */
  children?: ReactNode;
}) {
  const content = COPY({ kind, planTitle });
  // So "Sign in" from a paused-guest link returns here instead of /home —
  // FE.10.
  const pathname = usePathname();

  return (
    <main
      className="vote-experience vote-state"
    >
      <div className="vote-state__inner">
        {content.title && <h1 className="vote-state__title">{content.title}</h1>}
        {content.body && (
          <p
            className="vote-state__body"
            role={kind === "loading" ? "status" : undefined}
          >
            {content.body}
          </p>
        )}

        {(onRetry || kind === "guest-paused") && (
          <div className="vote-state__actions">
            {onRetry && (
              <button type="button" className="vote-primary-action" onClick={onRetry}>
                Try again
              </button>
            )}
            {kind === "guest-paused" && (
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="vote-secondary-action">
                Sign in
              </Link>
            )}
          </div>
        )}

        {kind === "captcha" && children && (
          <div className="vote-state__slot">{children}</div>
        )}
      </div>
    </main>
  );
}

function COPY({
  kind,
  planTitle,
}: {
  kind: VoteStateKind;
  planTitle?: string | null;
}): { title: string | null; body: ReactNode } {
  switch (kind) {
    case "loading":
      return {
        title: null,
        body: planTitle ? `Loading ${planTitle}…` : "Loading the plan…",
      };
    case "captcha":
      return {
        title: "Open this plan securely",
        body: "A quick security check keeps the live vote clean.",
      };
    case "guest-paused":
      return {
        title: "Guest voting is paused",
        body: (
          <>
            <strong>This link works.</strong> The host just needs to switch
            guest access back on. Ask them to check, or sign in to vote.
          </>
        ),
      };
    case "retry":
      return {
        title: "This plan wouldn’t open",
        body: "The connection dropped before the plan loaded. Try again.",
      };
    case "cold-link":
      return {
        title: "This link’s gone cold",
        body: "The plan isn’t here anymore. Ask whoever sent it for a fresh link.",
      };
  }
}
