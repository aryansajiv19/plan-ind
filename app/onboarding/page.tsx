import { redirect } from "next/navigation";
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-7">
        <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-grape">One quick detail</p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight">Make your suggestions fit the group.</h1>
        <p className="mt-4 text-muted">Your date of birth stays private. We use it to avoid places with age restrictions and keep recommendations suitable for the people planning together.</p>
      </div>
      <AgeForm />
    </main>
  );
}
