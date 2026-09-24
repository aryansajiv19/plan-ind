import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import Turnstile, { type TurnstileStatus } from "@/components/Turnstile";
import VoteState from "@/components/VoteState";
import type { Access, Load } from "@/hooks/use-plan-data";
import type { Plan } from "@/lib/types";

  // ── States ───────────────────────────────────────────────────────
  // All six full-screen non-content states render through <VoteState>. The
  // access reasons come straight from bootstrapPlanAccess; the load ones from
  // the plan/spots fetch below.
//
// A plain function, not a component, so the page's element tree is exactly
// what it was when these returns lived inline in it. Returns null when the
// plan is ready to render (the name gate is still the page's).
export function planStateScreen({
  deleted,
  left,
  plan,
  access,
  load,
  captchaStatus,
  setCaptchaStatus,
  onCaptchaVerify,
  retryAccess,
  setLoad,
  setReloadKey,
}: {
  deleted: "self" | "remote" | null;
  left: "open" | "decided" | null;
  plan: Plan | null;
  access: Access;
  load: Load;
  captchaStatus: TurnstileStatus;
  setCaptchaStatus: Dispatch<SetStateAction<TurnstileStatus>>;
  onCaptchaVerify: (token: string) => void;
  retryAccess: () => void;
  setLoad: Dispatch<SetStateAction<Load>>;
  setReloadKey: Dispatch<SetStateAction<number>>;
}) {
  if (deleted) {
    return <VoteState kind={deleted === "self" ? "deleted-by-you" : "deleted"} planTitle={plan?.title} />;
  }
  // After leaving, the plan's reads return nothing (RLS) -- which must not be
  // shown as "not found". Say what happened, and how to come back.
  if (left) {
    return (
      <main className="vote-experience vote-state">
        <div className="vote-state__inner">
          <h1 className="vote-state__title">You left {plan?.title ? `“${plan.title}”` : "this plan"}</h1>
          <p className="vote-state__body">
            {left === "decided"
              ? "Your RSVP and rating were removed; your votes stay as part of how the group decided."
              : "Your votes and RSVP were removed."}{" "}
            Open the link again any time to rejoin.
          </p>
          <div className="vote-state__actions">
            <button type="button" className="vote-primary-action" onClick={() => window.location.reload()}>Rejoin</button>
            <Link href="/home" className="vote-secondary-action">Go home</Link>
          </div>
        </div>
      </main>
    );
  }
  if (access === "captcha-required") {
    return (
      <VoteState kind="captcha" captchaStatus={captchaStatus}>
        <Turnstile action="plan-access" onVerify={onCaptchaVerify} onStatus={setCaptchaStatus} />
      </VoteState>
    );
  }
  if (access === "anonymous-disabled") {
    return <VoteState kind="guest-paused" />;
  }
  if (access === "sign-in-failed" || access === "claim-failed") {
    return <VoteState kind="retry" onRetry={retryAccess} />;
  }
  if (access === "not-found") {
    return <VoteState kind="cold-link" />;
  }

  // "checking" means we haven't been allowed to look yet — not that the plan is
  // absent. Only a load that actually ran can report notfound/error below.
  if (access === "checking" || load === "loading") {
    return <VoteState kind="loading" planTitle={plan?.title} />;
  }

  if (load === "notfound") {
    return <VoteState kind="cold-link" />;
  }

  if (load === "error") {
    return (
      <VoteState
        kind="retry"
        onRetry={() => { setLoad("loading"); setReloadKey((k) => k + 1); }}
      />
    );
  }
  return null;
}
