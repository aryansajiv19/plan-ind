import { redirect } from "next/navigation";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { fetchPlanSharePreview } from "@/lib/share-preview-server";

// The plan a `next` of /plan/<uuid> points at, if any.
function planIdFrom(next: string): string | null {
  return /^\/plan\/([0-9a-f-]{36})$/i.exec(next)?.[1] ?? null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const next = safeNextPath(params.next);
  // proxy.ts sends a signed-out visitor on a plan link here with
  // `?next=/plan/<id>`, so signing in returns them to the plan instead of
  // dropping them on /home.
  if (user) redirect(next);
  // Say which plan. The title comes from plan_share_preview (migration 062):
  // the keyless read that already builds this link's WhatsApp card, so it
  // shows nothing a link holder can't already see, and never a member-scoped
  // row. Null (bad id, deleted plan, timeout) falls back to generic copy.
  const planId = planIdFrom(next);
  const planTitle = planId ? (await fetchPlanSharePreview(planId))?.title ?? null : null;
  const pageError = params.message ?? (params.error === "google"
    ? "Google sign-in is not configured yet. Enable Google in Supabase Authentication, or use email instead."
    : params.error === "callback"
      ? "Sign-in could not be completed. Check the OAuth redirect settings and try again."
      : params.error);

  return (
    <main className="auth-shell">
      <div className="auth-frame">
        <section className="auth-intro" aria-labelledby="auth-title">
          <Link href="/" className="auth-mark" aria-label="Deal three home"><span>D/</span><b>03</b></Link>
          {planId ? (
            <>
              <p className="auth-kicker">A plan is waiting</p>
              <h1 id="auth-title">
                {planTitle
                  ? <>Sign in to vote on<br /><em>“{planTitle}”</em></>
                  : <>Sign in to join<br /><em>this plan.</em></>}
              </h1>
              <p className="auth-copy">Continue with Google or get a code by email. It takes seconds, and you’ll land right back on the plan.</p>
            </>
          ) : (
            <>
              <p className="auth-kicker">Dubai, together</p>
              <h1 id="auth-title">Plans happen<br /><em>together.</em></h1>
              <p className="auth-copy">A calmer way to decide where the group is going next. Pick a feeling, share the shortlist, and let everyone choose.</p>
            </>
          )}
        </section>
        <section className="auth-panel" aria-label="Sign in or create an account">
          <div className="auth-panel__heading"><p>Welcome in</p><h2>Sign in or join</h2></div>
          <AuthForm pageError={pageError} next={next} />
        </section>
      </div>
    </main>
  );
}
