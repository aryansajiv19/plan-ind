import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, planIdFromNext, safeNextPath } from "@/lib/auth";
import { fetchPlanSharePreview } from "@/lib/share-preview-server";
import { readMemberAge } from "@/lib/age-policy";
import { createClient } from "@/lib/supabase/server";
import AgeForm from "@/components/AgeForm";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Where sign-in was headed (e.g. the plan link that started it); carried
  // through the form so a first-time member still lands there.
  const next = safeNextPath((await searchParams).next);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  // Date of birth is write-once, so this form has nothing left to do once it
  // is on file. Without this the page stays reachable forever.
  if (await readMemberAge(await createClient(), user.id) !== null) redirect(next);
  // P14: a starting name to confirm, so email sign-ups don't vote under
  // their email prefix without being asked.
  const meta = user.user_metadata.full_name ?? user.user_metadata.name;
  const suggestedName = (typeof meta === "string" && meta.trim()) || user.email?.split("@")[0] || "";
  // Name the plan this sign-in started from, so the detour reads as one step on the way there.
  const planId = planIdFromNext(next);
  const planTitle = planId ? (await fetchPlanSharePreview(planId))?.title ?? null : null;

  return (
    <main className="auth-shell">
      <div className="auth-frame">
        <section className="auth-intro" aria-labelledby="onboarding-title">
          <Link href="/" className="auth-mark" aria-label="Planind home">Planind</Link>
          <p className="auth-kicker">One quick detail</p>
          <h1 id="onboarding-title">Suggestions that<br /><em>fit the group.</em></h1>
          <p className="auth-copy">Some places in Dubai have an age requirement. Knowing your date of birth lets us leave those out instead of suggesting somewhere the group can&rsquo;t actually get into.</p>
          {planTitle && <p className="auth-copy">Then straight on to <em>“{planTitle}”</em>.</p>}
        </section>
        <section className="auth-panel" aria-label="Add your date of birth">
          <div className="auth-panel__heading"><p>Almost there</p><h2>When were you born?</h2></div>
          <AgeForm next={next} suggestedName={suggestedName} />
        </section>
      </div>
    </main>
  );
}
