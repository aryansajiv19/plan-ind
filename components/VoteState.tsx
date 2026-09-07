"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { TurnstileStatus } from "@/components/Turnstile";
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
  captchaStatus,
}: {
  kind: VoteStateKind;
  /** Shown in the loading copy once the plan row is known. */
  planTitle?: string | null;
  /** Required for `kind="retry"` — renders the primary "Try again" button. */
  onRetry?: () => void;
  /** `kind="captcha"` only: the <Turnstile> widget. */
  children?: ReactNode;
  /** `kind="captcha"` only. Explains a check that is slow or never arriving. */
  captchaStatus?: TurnstileStatus;
}) {
  const content = COPY({ kind, planTitle, captchaStatus });
  // So "Sign in" from a paused-guest link returns here instead of /home —
  // FE.10.
  const pathname = usePathname();
  const captchaFailed = kind === "captcha" && captchaStatus === "failed";

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

        {kind === "captcha" && captchaStatus === "loading" && (
          <p className="vote-state__note" role="status">Checking your browser…</p>
        )}

        {(onRetry || kind === "guest-paused" || captchaFailed) && (
          <div className="vote-state__actions">
            {onRetry && (
              <button type="button" className="vote-primary-action" onClick={onRetry}>
                Try again
              </button>
            )}
            {(kind === "guest-paused" || captchaFailed) && (
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="vote-secondary-action">
                {captchaFailed ? "Go to sign in" : "Sign in"}
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
  captchaStatus,
}: {
  kind: VoteStateKind;
  planTitle?: string | null;
  captchaStatus?: TurnstileStatus;
}): { title: string | null; body: ReactNode } {
  // A guest whose bot check never loads is in the worst position of anyone
  // who hits this app: they did not choose it, they tapped a link a friend
  // sent, and they have no account. Both obvious ways forward are closed by
  // the SAME failure — guest access needs a token, and so does email
  // sign-in — so this has to name the one path that still works rather than
  // say "try again" and send them round the loop. Google OAuth does not
  // touch Turnstile.
  if (kind === "captcha" && captchaStatus === "failed") {
    return {
      title: "The security check didn’t load",
      body: (
        <>
          It has to pass before you can open a shared plan, and email sign-in
          needs it too. <strong>Continue with Google</strong> on the sign-in
          page still works — or reload if you would rather try the check again.
        </>
      ),
    };
  }
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
