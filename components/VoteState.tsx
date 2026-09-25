"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The vote page's full-screen non-content states, in one place.
 *
 * Before this there were six near-identical hand-rolled blocks in
 * `app/plan/[id]/page.tsx`, drifting in copy and class list — and a real
 * first-touch surface for someone arriving on a dead link.
 *
 * `signed-out` is its own kind: the link is fine, the session isn't. proxy.ts
 * normally redirects before this can render; it covers a session that ended
 * with the page open. It must never read as "you have a bad link."
 *
 * Colour: none. A state screen is not "you", not the outcome, not a category —
 * graphite ink on the inherited ground. The only fill is the "Try again" button
 * (a commit action). See FE.7 in design-system/SPECS.md.
 */
export type VoteStateKind =
  | "loading"
  | "signed-out"
  | "retry"
  | "cold-link"
  | "deleted"
  | "deleted-by-you";

export default function VoteState({
  kind,
  planTitle,
  onRetry,
}: {
  kind: VoteStateKind;
  /** Shown in the loading copy once the plan row is known. */
  planTitle?: string | null;
  /** Required for `kind="retry"` — renders the primary "Try again" button. */
  onRetry?: () => void;
}) {
  const content = COPY({ kind, planTitle });
  // So "Sign in" returns here instead of /home — FE.10.
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

        {/* Three card shapes where the round will land: reads as "the
            places are coming", not an idle wait. Shimmer, never a spinner. */}
        {kind === "loading" && (
          <div className="mx-auto mt-6 grid w-[min(26rem,85vw)] grid-cols-3 gap-2" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="wall-skeleton h-36" />)}
          </div>
        )}

        {(onRetry || kind === "signed-out") && (
          <div className="vote-state__actions">
            {onRetry && (
              <button type="button" className="vote-primary-action" onClick={onRetry}>
                Try again
              </button>
            )}
            {kind === "signed-out" && (
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="vote-primary-action">
                Sign in
              </Link>
            )}
          </div>
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
    case "signed-out":
      return {
        title: "Sign in to join this plan",
        body: (
          <>
            <strong>This link works.</strong> Sign in with Google or an email
            code and you’ll come straight back here.
          </>
        ),
      };
    case "retry":
      return {
        title: "This plan wouldn’t open",
        body: "The connection dropped before the plan loaded. Try again.",
      };
    // Deliberately not "deleted": once a plan is gone its row is too, so a
    // deleted plan and a mistyped link look identical from here. Say both.
    case "cold-link":
      return {
        title: "This link’s gone cold",
        body: "This plan isn’t here anymore — the host may have deleted it, or the link is incomplete. Ask whoever sent it for a fresh one.",
      };
    case "deleted":
      return {
        title: "This plan was deleted",
        body: planTitle
          ? `The host deleted “${planTitle}” while you had it open. Ask them if there’s a new plan.`
          : "The host deleted this plan while you had it open. Ask them if there’s a new plan.",
      };
    case "deleted-by-you":
      return {
        title: "Plan deleted",
        body: planTitle
          ? `“${planTitle}” is gone for everyone who had the link.`
          : "It’s gone for everyone who had the link.",
      };
  }
}
