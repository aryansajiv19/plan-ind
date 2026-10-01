"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import Turnstile, { type TurnstileStatus } from "@/components/Turnstile";
import { usePlanPreview } from "@/components/vote/PlanPreview";
import { rememberGuestName } from "@/hooks/use-guest-session";
import { cleanGuestName, GUEST_NAME_MAX, validGuestName } from "@/lib/guest-name";
import { secureJsonFetch } from "@/lib/security/csrf-client";

type JoinState = { error?: string; needsAccount?: boolean };

function JoinButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="vote-primary-action w-full disabled:opacity-60">
      {pending ? "Joining…" : "Join and vote"}
    </button>
  );
}

/**
 * The first screen a friend sees on a plan link with no member session
 * (guest voting, docs/GUEST_VOTE.md): a first name and one tap. The server
 * (POST /api/guest/join) answers every refusal in a sentence of its own, shown
 * as-is; a refusal an account can fix (full, age limit, expired) adds the
 * sign-in door. On success the page reloads so the browser client, Realtime
 * and every read start from the new session.
 */
export default function JoinPlan({ planId }: { planId: string }) {
  const preview = usePlanPreview();
  const [name, setName] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaStatus, setCaptchaStatus] = useState<TurnstileStatus>("loading");
  // Bumped after a refused token: it is single use, so the widget must remount.
  const [widgetKey, setWidgetKey] = useState(0);
  const gateClosed = process.env.NODE_ENV === "production" && !captchaToken;
  const clean = cleanGuestName(name);

  const [state, action] = useActionState(async (): Promise<JoinState> => {
    let response: Response;
    try {
      response = await secureJsonFetch("/api/guest/join", { method: "POST", body: JSON.stringify({ planId, name: clean, captchaToken }) });
    } catch {
      return { error: "Couldn’t reach Planind. Check your connection and try again." };
    }
    const body = await response.json().catch(() => ({})) as { ok?: boolean; name?: string; error?: string; needsAccount?: boolean };
    if (response.ok && body.ok) {
      rememberGuestName(planId, body.name ?? clean);
      window.location.reload();
      return {};
    }
    setCaptchaToken("");
    setWidgetKey((k) => k + 1);
    return { error: body.error ?? "That didn’t work. Please try again.", needsAccount: body.needsAccount === true };
  }, {});

  const host = preview?.host_first_name;
  const signIn = `/login?next=${encodeURIComponent(`/plan/${planId}`)}`;

  return (
    <main className="vote-experience vote-state">
      <div className="vote-state__inner w-full">
        <p className="vote-state__note !mt-0">{host ? `${host} wants your vote` : "Your vote is wanted"}</p>
        <h1 className="vote-state__title mt-1">{host ? `Join ${host}’s plan` : "Join this plan"}</h1>
        {preview?.title && <p className="vote-state__body font-display text-lg text-ink">“{preview.title}”</p>}
        <p className="vote-state__body">Add your first name and vote. No account needed.</p>

        <form action={action} className="mx-auto mt-6 flex max-w-xs flex-col gap-3 text-left">
          <label htmlFor="guest-name" className="text-sm font-medium text-ink">Your first name</label>
          <input
            id="guest-name"
            name="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
            minLength={2}
            maxLength={GUEST_NAME_MAX}
            autoComplete="given-name"
            enterKeyHint="go"
            className="vote-field min-h-11 rounded-xl border-2 border-ink bg-card px-3 py-2 font-medium"
          />
          <Turnstile key={widgetKey} action="plan-access" onVerify={setCaptchaToken} onStatus={setCaptchaStatus} />
          <JoinButton disabled={!validGuestName(clean) || gateClosed} />
          {/* One message for one cause: Turnstile's own alert is off while this listens. */}
          {gateClosed && validGuestName(clean) && captchaStatus === "loading" && (
            <p className="vote-state__note text-center" role="status">Checking your browser…</p>
          )}
          {gateClosed && captchaStatus === "failed" && (
            <p className="vote-state__note text-center" role="alert">
              The security check didn’t load, so joining as a guest isn’t available right now. Reload to try again, or sign in.
            </p>
          )}
        </form>

        {state.error && (
          <p role="alert" className="mx-auto mt-4 max-w-xs text-sm font-medium text-error">{state.error}</p>
        )}
        {state.needsAccount && (
          <div className="vote-state__actions">
            <Link href={signIn} className="vote-primary-action">Sign in to join</Link>
          </div>
        )}

        {!state.needsAccount && (
          <p className="vote-state__note mt-6">
            Have an account? <Link href={signIn} className="underline underline-offset-2">Sign in</Link>
          </p>
        )}
      </div>
    </main>
  );
}
