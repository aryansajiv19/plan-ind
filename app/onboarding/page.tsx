import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { memberAge } from "@/lib/age-policy";
import { createClient } from "@/lib/supabase/server";
import AgeForm from "@/components/AgeForm";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Date of birth is write-once, so this form has nothing left to do once it
  // is on file. Without this the page stays reachable forever.
  if (await memberAge(await createClient(), user.id) !== null) redirect("/home");

  return (
    <main className="auth-shell">
      <div className="auth-frame">
        <section className="auth-intro" aria-labelledby="onboarding-title">
          <Link href="/" className="auth-mark" aria-label="Deal three home"><span>D/</span><b>03</b></Link>
          <p className="auth-kicker">One quick detail</p>
          <h1 id="onboarding-title">Suggestions that<br /><em>fit the group.</em></h1>
          <p className="auth-copy">Some places in Dubai have an age requirement. Knowing your date of birth lets us leave those out instead of suggesting somewhere the group can&rsquo;t actually get into.</p>
        </section>
        <section className="auth-panel" aria-label="Add your date of birth">
          <div className="auth-panel__heading"><p>Almost there</p><h2>When were you born?</h2></div>
          <AgeForm />
        </section>
      </div>
    </main>
  );
}
