import { redirect } from "next/navigation";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser, safeNextPath } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const next = safeNextPath(params.next);
  // A guest who lands here from the vote page's "guest voting is paused"
  // screen (VoteState.tsx) carries `?next=/plan/<id>` so signing in returns
  // them to the plan instead of dropping them on /home.
  if (user) redirect(next);
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
          <p className="auth-kicker">Dubai, together</p>
          <h1 id="auth-title">Plans happen<br /><em>together.</em></h1>
          <p className="auth-copy">A calmer way to decide where the group is going next. Pick a feeling, share the shortlist, and let everyone choose.</p>
        </section>
        <section className="auth-panel" aria-label="Sign in or create an account">
          <div className="auth-panel__heading"><p>Welcome in</p><h2>Sign in or join</h2></div>
          <AuthForm pageError={pageError} next={next} />
        </section>
      </div>
    </main>
  );
}
